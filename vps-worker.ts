// VPS Worker v2 — downloads YouTube videos, transcribes, and renders
// Runs on the VPS where yt-dlp, whisper.cpp, and ffmpeg are installed
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as https from "https";

const RAILWAY_URL = process.env.RAILWAY_URL ?? "https://web-production-5df9e.up.railway.app";
const WHISPER_CLI = process.env.WHISPER_CLI ?? "/tmp/whisper.cpp/build/bin/whisper-cli";
const WHISPER_MODEL = process.env.WHISPER_MODEL ?? "/tmp/whisper.cpp/models/ggml-base.en.bin";
const YT_DLP = process.env.YT_DLP ?? "/opt/data/.local/bin/yt-dlp";
const TMP_DIR = process.env.WORKER_TMP_DIR ?? "/tmp/clip-mounter-v2";
const VIDEOS_DIR = process.env.VIDEOS_DIR ?? "/opt/data/clip-mounter-v2/videos";
const OUTPUTS_DIR = process.env.OUTPUTS_DIR ?? "/opt/data/clip-mounter-v2/outputs";
const POLL_MS = parseInt(process.env.POLL_MS ?? "10000", 10);

// === HTTP helpers ===
function httpGet(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let d = ""; res.on("data", (c) => (d += c));
      res.on("end", () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } });
    }).on("error", reject);
  });
}

function httpPost(url: string, body: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const u = new URL(url); const pd = JSON.stringify(body);
    const req = https.request({
      hostname: u.hostname, port: 443, path: u.pathname + u.search, method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(pd) },
    }, (res) => { let d = ""; res.on("data", (c) => (d += c)); res.on("end", () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } }); });
    req.on("error", reject); req.write(pd); req.end();
  });
}

function httpPatch(url: string, body: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const u = new URL(url); const pd = JSON.stringify(body);
    const req = https.request({
      hostname: u.hostname, port: 443, path: u.pathname + u.search, method: "PATCH",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(pd) },
    }, (res) => { let d = ""; res.on("data", (c) => (d += c)); res.on("end", () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } }); });
    req.on("error", reject); req.write(pd); req.end();
  });
}

function runCmd(cmd: string, args: string[], timeoutSec = 600): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "ignore" });
    const t = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("timeout")); }, timeoutSec * 1000);
    child.on("close", (code) => { clearTimeout(t); resolve(code ?? 0); });
    child.on("error", (e) => { clearTimeout(t); reject(e); });
  });
}

function runCmdWithOutput(cmd: string, args: string[], timeoutSec = 60): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    const t = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("timeout")); }, timeoutSec * 1000);
    child.on("close", () => { clearTimeout(t); resolve(out); });
    child.on("error", (e) => { clearTimeout(t); reject(e); });
  });
}

// === YouTube download ===
async function downloadYouTube(youtubeUrl: string, outputPath: string): Promise<{ title: string; duration: number }> {
  // Download best quality 1080p with yt-dlp
  await runCmd(YT_DLP, [
    "-f", "bestvideo[height<=1080]+bestaudio/best[height<=1080]/best",
    "--merge-output-format", "mp4",
    "-o", outputPath,
    youtubeUrl,
  ], 600);

  // Get title + duration
  let title = "Unknown";
  let duration = 0;
  try {
    const info = await runCmdWithOutput(YT_DLP, ["--dump-json", youtubeUrl], 30);
    const data = JSON.parse(info);
    title = data.title ?? "Unknown";
    duration = data.duration ?? 0;
  } catch {}

  return { title, duration };
}

// === Transcription ===
interface Segment { start: number; end: number; text: string; }

function parseWhisperJson(jsonPath: string, offset = 0): Segment[] {
  if (!fs.existsSync(jsonPath)) return [];
  const data = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
  return (data.transcription ?? []).map((s: any) => ({
    start: (s.offsets?.from ?? 0) / 1000 + offset,
    end: (s.offsets?.to ?? 0) / 1000 + offset,
    text: (s.text ?? "").trim(),
  }));
}

async function transcribe(videoPath: string): Promise<Segment[]> {
  const tmpDir = path.dirname(videoPath);
  const audioPath = path.join(tmpDir, "audio-16k.wav");

  await runCmd("ffmpeg", ["-y", "-vn", "-i", videoPath, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", audioPath], 300);
  if (!fs.existsSync(audioPath) || fs.statSync(audioPath).size < 1000) return [];

  let duration = 0;
  try {
    const out = await runCmdWithOutput("ffprobe", ["-v", "quiet", "-print_format", "json", "-show_format", audioPath], 15);
    duration = parseFloat(JSON.parse(out).format?.duration ?? "0");
  } catch {}

  const allSegments: Segment[] = [];

  if (duration > 300) {
    const numChunks = Math.ceil(duration / 300);
    for (let i = 0; i < numChunks; i++) {
      const chunkStart = i * 300;
      const chunkPath = path.join(tmpDir, `chunk-${i}.wav`);
      const jsonPath = chunkPath + ".json";
      try {
        await runCmd("ffmpeg", ["-y", "-ss", String(chunkStart), "-t", "300", "-i", audioPath, "-c", "copy", chunkPath], 60);
        await runCmd(WHISPER_CLI, ["-m", WHISPER_MODEL, "-f", chunkPath, "-oj", "-np", "-t", "2", "-nth", "0.3"], 600);
        allSegments.push(...parseWhisperJson(jsonPath, chunkStart));
      } catch {}
      try { fs.unlinkSync(jsonPath); } catch {}
      try { fs.unlinkSync(chunkPath); } catch {}
    }
  } else {
    const jsonPath = audioPath + ".json";
    try { await runCmd(WHISPER_CLI, ["-m", WHISPER_MODEL, "-f", audioPath, "-oj", "-np", "-t", "2", "-nth", "0.3"], 600); } catch {}
    allSegments.push(...parseWhisperJson(jsonPath));
    try { fs.unlinkSync(jsonPath); } catch {}
  }

  try { fs.unlinkSync(audioPath); } catch {}
  return allSegments;
}

function formatTranscript(segments: Segment[]): string {
  return segments.filter((s) => s.text.trim()).map((s) => {
    const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
    return `[${fmt(s.start)}-${fmt(s.end)}] ${s.text}`;
  }).join("\n");
}

// === Render ===
async function renderVideo(projectId: string, timeline: any): Promise<string> {
  const tmpDir = path.join(TMP_DIR, `render-${projectId}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  const concatList: string[] = [];

  for (let i = 0; i < timeline.segments.length; i++) {
    const seg = timeline.segments[i];
    // Find the video file on VPS
    const videoFile = path.join(VIDEOS_DIR, `${seg.videoId}.mp4`);
    if (!fs.existsSync(videoFile)) throw new Error(`Video file missing: ${seg.videoId}`);

    const segPath = path.join(tmpDir, `seg-${String(i).padStart(3, "0")}.mp4`);

    // Cut the segment
    const args = ["ffmpeg", "-y", "-ss", String(seg.trimStart)];
    if (seg.trimEnd !== null) args.push("-to", String(seg.trimEnd));
    args.push("-i", videoFile, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-vf",
      "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,fps=30",
      "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", segPath);
    await runCmd(args[0], args.slice(1), 120);
    concatList.push(`file '${segPath}'`);
  }

  // Concat
  const listPath = path.join(tmpDir, "concat.txt");
  fs.writeFileSync(listPath, concatList.join("\n"));
  const outputPath = path.join(OUTPUTS_DIR, `${projectId}.mp4`);
  fs.mkdirSync(OUTPUTS_DIR, { recursive: true });
  await runCmd("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outputPath], 120);

  try { fs.rmSync(tmpDir, { recursive: true }); } catch {}
  return `${projectId}.mp4`;
}

// === Main loop ===
async function main() {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.mkdirSync(VIDEOS_DIR, { recursive: true });
  fs.mkdirSync(OUTPUTS_DIR, { recursive: true });
  console.log(`[vps-worker-v2] Started. Railway: ${RAILWAY_URL}`);

  while (true) {
    try {
      const jobs = await httpGet(`${RAILWAY_URL}/api/transcription-jobs`) as any;

      // 1. Download videos
      for (const v of (jobs.needsDownload ?? [])) {
        console.log(`\n[vps-worker] Downloading: ${v.youtube_url}`);
        const videoPath = path.join(VIDEOS_DIR, `${v.id}.mp4`);
        try {
          const { title, duration } = await downloadYouTube(v.youtube_url, videoPath);
          console.log(`  Downloaded: ${title} (${duration}s)`);
          await httpPatch(`${RAILWAY_URL}/api/videos/${v.id}`, {
            title, duration, transcript_status: "transcribing",
          });
        } catch (e) {
          console.log(`  Download failed: ${e}`);
          await httpPatch(`${RAILWAY_URL}/api/videos/${v.id}`, { transcript_status: "error" });
        }
      }

      // 2. Transcribe videos
      for (const v of (jobs.needsTranscript ?? [])) {
        console.log(`\n[vps-worker] Transcribing: ${v.name || v.id}`);
        const videoPath = path.join(VIDEOS_DIR, `${v.id}.mp4`);
        if (!fs.existsSync(videoPath)) {
          console.log(`  Video file missing, skipping`);
          continue;
        }
        const segments = await transcribe(videoPath);
        const transcript = formatTranscript(segments);
        console.log(`  Got ${segments.length} segments`);
        await httpPost(`${RAILWAY_URL}/api/videos/${v.id}/transcript`, { transcript });
      }

      // 3. Check for render jobs
      const renderJobs = await httpGet(`${RAILWAY_URL}/api/render-jobs`) as any;
      for (const job of (renderJobs.jobs ?? [])) {
        console.log(`\n[vps-worker] Rendering: ${job.project_id}`);
        const project = await httpGet(`${RAILWAY_URL}/api/projects/${job.project_id}`) as any;
        if (!project?.project?.timeline_json) continue;

        const timeline = JSON.parse(project.project.timeline_json);
        try {
          const outputPath = await renderVideo(job.project_id, timeline);
          console.log(`  Rendered: ${outputPath}`);
          await httpPatch(`${RAILWAY_URL}/api/projects/${job.project_id}`, {
            status: "done", output_path: outputPath, error: null,
          });
          await httpPost(`${RAILWAY_URL}/api/render-jobs/${job.id}/done`, {});
        } catch (e: any) {
          console.log(`  Render failed: ${e.message}`);
          await httpPatch(`${RAILWAY_URL}/api/projects/${job.project_id}`, {
            status: "error", error: e.message,
          });
        }
      }
    } catch (err) {
      console.error("[vps-worker] Error:", err);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main().catch(console.error);