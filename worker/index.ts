// Worker — runs on the SAME machine as the web app and talks to SQLite directly.
// No HTTP, no cross-network uploads. Two independent loops:
//   ingestLoop  — metadata + transcript + DOWNLOAD (at add-time, with retries)
//   renderLoop  — cut + stitch already-downloaded files into a 1080x1920 MP4
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import {
  PATHS,
  MAX_ATTEMPTS,
  getDb,
  listVideosNeedingWork,
  patchVideo,
  getProject,
  updateProject,
  claimNextRenderJob,
  completeRenderJob,
  recoverStuckJobs,
  listVideosNeedingSceneIndex,
  insertScenes,
  markVideoScenesIndexed,
  type VideoRow,
} from "../src/lib/db";
import { embedBatch } from "../src/lib/embeddings";
import { caption, captionEnabled } from "../src/lib/vision";
import { synthesize, ttsEnabled } from "../src/lib/tts";
import type { Timeline } from "../src/lib/types";

const PYTHON = process.env.PYTHON ?? "python3";
const FETCH_SCRIPT = process.env.FETCH_SCRIPT ?? path.join(process.cwd(), "youtube_fetch.py");
const POLL_MS = parseInt(process.env.POLL_MS ?? "5000", 10);
const TMP_ROOT = process.env.TMP_ROOT ?? path.join(PATHS.dataDir, "tmp");

const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

// === subprocess helpers (all with hard timeouts) ===

function runCmd(cmd: string, args: string[], timeoutSec: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "ignore" });
    const t = setTimeout(() => { child.kill("SIGKILL"); reject(new Error(`timeout after ${timeoutSec}s`)); }, timeoutSec * 1000);
    child.on("close", (code) => { clearTimeout(t); code === 0 ? resolve() : reject(new Error(`exit ${code}`)); });
    child.on("error", (e) => { clearTimeout(t); reject(e); });
  });
}

function runJson<T>(cmd: string, args: string[], timeoutSec: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    const t = setTimeout(() => { child.kill("SIGKILL"); reject(new Error(`timeout after ${timeoutSec}s`)); }, timeoutSec * 1000);
    child.on("close", (code) => {
      clearTimeout(t);
      const last = out.trim().split("\n").pop() ?? "";
      try {
        const parsed = JSON.parse(last) as T;
        resolve(parsed);
      } catch {
        reject(new Error(err.trim().slice(-200) || `exit ${code}, non-JSON output`));
      }
    });
    child.on("error", (e) => { clearTimeout(t); reject(e); });
  });
}

// === YouTube operations (delegate to youtube_fetch.py) ===

interface Info { title: string; duration: number; channel: string; thumbnail: string }
interface Seg { start: number; end: number; text: string }

async function fetchInfo(youtubeId: string): Promise<Info | null> {
  try {
    const info = await runJson<Info & { error?: string }>(PYTHON, [FETCH_SCRIPT, youtubeId, "info"], 90);
    return info.error ? null : info;
  } catch (e) { log("  info failed:", (e as Error).message); return null; }
}

async function fetchTranscript(youtubeId: string): Promise<Seg[]> {
  try {
    return await runJson<Seg[]>(PYTHON, [FETCH_SCRIPT, youtubeId, "transcript"], 180);
  } catch (e) { log("  transcript failed:", (e as Error).message); return []; }
}

async function downloadVideo(youtubeId: string, outPath: string): Promise<boolean> {
  try {
    const r = await runJson<{ success: boolean }>(PYTHON, [FETCH_SCRIPT, youtubeId, "download", outPath], 900);
    return r.success === true;
  } catch (e) { log("  download failed:", (e as Error).message); return false; }
}

function formatTranscript(segs: Seg[]): string {
  return segs.map((s) => {
    const m = Math.floor(s.start / 60);
    const sec = Math.floor(s.start % 60);
    return `[${m}:${sec.toString().padStart(2, "0")}] ${s.text}`;
  }).join("\n");
}

// === Ingest: metadata + transcript + download, each step persisted independently ===

async function ingestVideo(v: VideoRow): Promise<void> {
  log(`[ingest] ${v.youtube_id} (${v.id})`);
  let progressed = false;

  // 1. Metadata (only if still placeholder).
  if (!v.duration || v.title === `YouTube ${v.youtube_id}` || !v.title) {
    const info = await fetchInfo(v.youtube_id);
    if (info) {
      await patchVideo(v.id, {
        title: info.title, duration: info.duration, channel: info.channel, thumbnail_url: info.thumbnail,
      });
      progressed = true;
    }
  }

  // 2. Transcript.
  if (v.transcript_status === "pending" || v.transcript_status === "fetching") {
    await patchVideo(v.id, { transcript_status: "fetching" });
    const segs = await fetchTranscript(v.youtube_id);
    if (segs.length > 0) {
      await patchVideo(v.id, {
        transcript: formatTranscript(segs),
        transcript_json: JSON.stringify(segs),
        transcript_status: "done",
      });
      log(`  transcript: ${segs.length} segments`);
      progressed = true;
    }
  }

  // 3. Download the actual file — AT ADD-TIME, not render-time.
  if (v.download_status === "pending" || v.download_status === "downloading") {
    await patchVideo(v.id, { download_status: "downloading" });
    const outPath = path.join(PATHS.videosDir, `${v.id}.mp4`);
    const ok = await downloadVideo(v.youtube_id, outPath);
    if (ok) {
      await patchVideo(v.id, { storage_path: `${v.id}.mp4`, download_status: "downloaded" });
      log(`  downloaded: ${(fs.statSync(outPath).size / 1024 / 1024).toFixed(1)} MB`);
      progressed = true;
    }
  }

  // 4. Attempt accounting → give up gracefully after MAX_ATTEMPTS.
  if (!progressed) {
    const attempts = v.attempts + 1;
    const patch: Partial<VideoRow> = { attempts };
    if (attempts >= MAX_ATTEMPTS) {
      patch.last_error = "exhausted retries";
      if (v.transcript_status !== "done") patch.transcript_status = "error";
      if (v.download_status !== "downloaded") patch.download_status = "error";
      log(`  giving up after ${attempts} attempts`);
    }
    await patchVideo(v.id, patch);
  } else if (v.attempts > 0) {
    await patchVideo(v.id, { attempts: 0 }); // reset backoff after progress
  }
}

// === Render: cut + stitch already-downloaded files ===

async function renderTimeline(projectId: string, timeline: Timeline): Promise<string> {
  const tmpDir = path.join(TMP_ROOT, `render-${projectId}`);
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(tmpDir, { recursive: true });

    if (!timeline.segments?.length) throw new Error("timeline has no segments");
    const concat: string[] = [];

    for (let i = 0; i < timeline.segments.length; i++) {
      const seg = timeline.segments[i];
      const src = path.join(PATHS.videosDir, `${seg.videoId}.mp4`);
      if (!fs.existsSync(src)) {
        throw new Error(`source video ${seg.videoId} not downloaded yet — cannot render`);
      }
      const segPath = path.join(tmpDir, `seg-${String(i).padStart(3, "0")}.mp4`);
      const VF = "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,fps=30";

      let voiced = false;
      if (timeline.voiceover && seg.newText && ttsEnabled()) {
        try {
          // 1. silent, scaled footage clip
          const rawPath = path.join(tmpDir, `raw-${i}.mp4`);
          const rawArgs = ["-y", "-ss", String(seg.trimStart)];
          if (seg.trimEnd !== null && seg.trimEnd !== undefined) rawArgs.push("-to", String(seg.trimEnd));
          rawArgs.push("-i", src, "-vf", VF, "-an", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", rawPath);
          await runCmd("ffmpeg", rawArgs, 200);
          // 2. AI voiceover of this scene's script line
          const audioPath = path.join(tmpDir, `vo-${i}.mp3`);
          fs.writeFileSync(audioPath, await synthesize(seg.newText));
          // 3. loop the footage to the narration length + attach the voice
          await runCmd("ffmpeg", [
            "-y", "-stream_loop", "-1", "-i", rawPath, "-i", audioPath,
            "-map", "0:v:0", "-map", "1:a:0", "-shortest",
            "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-movflags", "+faststart", segPath,
          ], 200);
          voiced = true;
        } catch (e) {
          log(`  voiceover failed for scene ${i + 1} (${(e as Error).message.slice(0, 80)}) — using original audio`);
        }
      }

      if (!voiced) {
        const args = ["-y", "-ss", String(seg.trimStart)];
        if (seg.trimEnd !== null && seg.trimEnd !== undefined) args.push("-to", String(seg.trimEnd));
        args.push("-i", src, "-vf", VF, "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
          "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-movflags", "+faststart", segPath);
        await runCmd("ffmpeg", args, 300);
      }
      concat.push(`file '${segPath.replace(/'/g, "'\\''")}'`);
      log(`  ${voiced ? "voiced" : "cut"} ${i + 1}/${timeline.segments.length}`);
    }

    const listPath = path.join(tmpDir, "concat.txt");
    fs.writeFileSync(listPath, concat.join("\n"));

    const outPath = path.join(PATHS.outputsDir, `${projectId}.mp4`);
    fs.mkdirSync(PATHS.outputsDir, { recursive: true });
    await runCmd("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", "-movflags", "+faststart", outPath], 180);

    if (!fs.existsSync(outPath) || fs.statSync(outPath).size === 0) throw new Error("render produced empty file");
    log(`  output: ${(fs.statSync(outPath).size / 1024 / 1024).toFixed(1)} MB`);
    return `${projectId}.mp4`;
  } finally {
    // Always clean up — even on failure (fixes the temp-dir leak).
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// === Loops ===

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function ingestLoop() {
  for (;;) {
    try {
      const videos = await listVideosNeedingWork();
      for (const v of videos) await ingestVideo(v);
    } catch (e) { log("[ingest] loop error:", (e as Error).message); }
    await sleep(POLL_MS);
  }
}

async function renderLoop() {
  for (;;) {
    try {
      const job = await claimNextRenderJob();
      if (!job) { await sleep(POLL_MS); continue; }
      log(`[render] project ${job.project_id} (attempt ${job.attempts})`);
      try {
        const project = await getProject(job.project_id);
        if (!project?.timeline_json) throw new Error("no timeline");
        const timeline = JSON.parse(project.timeline_json) as Timeline;
        const outputRel = await renderTimeline(job.project_id, timeline);
        await updateProject(job.project_id, { status: "done", output_path: outputRel, error: null });
        await completeRenderJob(job.id, "done");
        log(`  ✓ done: ${outputRel}`);
      } catch (e) {
        const msg = (e as Error).message;
        log(`  ✗ render failed: ${msg}`);
        await updateProject(job.project_id, { status: "error", error: msg });
        await completeRenderJob(job.id, "error", msg);
      }
    } catch (e) { log("[render] loop error:", (e as Error).message); await sleep(POLL_MS); }
  }
}

// === Scene index (semantic) ===

interface Seg { start: number; end: number; text: string }

/** Merge tiny transcript cues into ~10s / ~220-char scenes — meatier units for embedding. */
function chunkScenes(segs: Seg[]): Seg[] {
  const out: Seg[] = [];
  let cur: Seg | null = null;
  for (const s of segs) {
    const text = (s.text || "").trim();
    if (!text) continue;
    if (!cur) cur = { start: s.start, end: s.end, text };
    else { cur.end = s.end; cur.text += " " + text; }
    if (cur.end - cur.start >= 10 || cur.text.length >= 220) { out.push(cur); cur = null; }
  }
  if (cur) out.push(cur);
  return out;
}

async function sceneIndexLoop() {
  for (;;) {
    try {
      const videos = await listVideosNeedingSceneIndex();
      for (const v of videos) {
        let segs: Seg[] = [];
        try { segs = JSON.parse(v.transcript_json) as Seg[]; } catch { await markVideoScenesIndexed(v.id); continue; }
        const chunks = chunkScenes(segs);
        if (chunks.length === 0) { await markVideoScenesIndexed(v.id); continue; }
        const src = path.join(PATHS.videosDir, `${v.id}.mp4`);
        const canCaption = captionEnabled() && fs.existsSync(src);
        log(`[scenes] indexing ${chunks.length} scenes for ${v.youtube_id}${canCaption ? " (+visual)" : ""}`);

        // Visual caption per scene: a keyframe at the scene midpoint → "what's shown".
        const captions: string[] = [];
        for (let ci = 0; ci < chunks.length; ci++) {
          let cap = "";
          if (canCaption) {
            const framePath = path.join(TMP_ROOT, `kf-${v.id}-${ci}.jpg`);
            try {
              const mid = (chunks[ci].start + chunks[ci].end) / 2;
              await runCmd("ffmpeg", ["-y", "-ss", String(mid), "-i", src, "-frames:v", "1", "-q:v", "3", framePath], 60);
              cap = await caption(framePath);
            } catch { /* caption is optional */ }
            finally { try { fs.rmSync(framePath, { force: true }); } catch {} }
          }
          captions.push(cap);
        }

        // Embed the combined (spoken + shown) text so matching uses both.
        for (let i = 0; i < chunks.length; i += 16) {
          const slice = chunks.slice(i, i + 16);
          const capSlice = captions.slice(i, i + 16);
          const combined = slice.map((c, j) => (capSlice[j] ? `${c.text} [shows: ${capSlice[j]}]` : c.text));
          const embs = await embedBatch(combined);
          await insertScenes(v.niche_id, v.id, slice.map((c, j) => ({ start: c.start, end: c.end, text: c.text, visualCaption: capSlice[j], embedding: embs[j] })));
        }
        await markVideoScenesIndexed(v.id);
        log(`[scenes] ✓ indexed ${v.youtube_id}`);
      }
    } catch (e) { log("[scenes] loop error:", (e as Error).message); }
    await sleep(POLL_MS);
  }
}

async function main() {
  await getDb();
  fs.mkdirSync(TMP_ROOT, { recursive: true });
  const recovered = await recoverStuckJobs();
  log(`[worker] started. data=${PATHS.dataDir} python=${PYTHON} recovered ${recovered} stuck job(s)`);
  await Promise.all([ingestLoop(), renderLoop(), sceneIndexLoop()]);
}

main().catch((e) => { console.error("[worker] fatal:", e); process.exit(1); });
