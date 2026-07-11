// VPS Worker v2 — YouTube transcript via free proxy + video download + render
// Uses youtube_fetch.py for transcript (youtube-transcript-api + free proxy)
// Uses yt-dlp for video download (via free SOCKS5 proxy)
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as https from "https";

const RAILWAY_URL = process.env.RAILWAY_URL ?? "https://web-production-c9bf3.up.railway.app";
const PYTHON = process.env.PYTHON ?? "/opt/data/.venvs/pot-provider/bin/python";
const FETCH_SCRIPT = process.env.FETCH_SCRIPT ?? "/opt/data/clip-mounter-v2/youtube_fetch.py";
const YT_DLP = process.env.YT_DLP ?? "/opt/data/.local/bin/yt-dlp";
const DENO = process.env.DENO ?? "/opt/data/.local/bin/deno";
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

function runCmdWithOutput(cmd: string, args: string[], timeoutSec = 120): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    const t = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("timeout")); }, timeoutSec * 1000);
    child.on("close", (code) => {
      clearTimeout(t);
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.slice(-200) || `exit ${code}`));
    });
    child.on("error", (e) => { clearTimeout(t); reject(e); });
  });
}

// === YouTube operations (via Python script) ===

async function fetchTranscript(videoId: string): Promise<{ segments: any[]; transcript: string }> {
  console.log(`  Fetching transcript via proxy...`);
  try {
    const output = await runCmdWithOutput(PYTHON, [FETCH_SCRIPT, videoId, "transcript"], 60);
    const segments = JSON.parse(output.trim());
    const transcript = segments
      .map((s: any) => {
        const m = Math.floor(s.start / 60);
        const sec = Math.floor(s.start % 60);
        return `[${m}:${sec.toString().padStart(2, "0")}] ${s.text}`;
      })
      .join("\n");
    console.log(`  Got ${segments.length} segments`);
    return { segments, transcript };
  } catch (e: any) {
    console.log(`  Transcript failed: ${e.message?.slice(0, 100)}`);
    return { segments: [], transcript: "" };
  }
}

async function fetchVideoInfo(videoId: string): Promise<{ title: string; duration: number }> {
  console.log(`  Fetching video info via proxy...`);
  try {
    const output = await runCmdWithOutput(PYTHON, [FETCH_SCRIPT, videoId, "info"], 180);
    const info = JSON.parse(output.trim());
    return { title: info.title ?? "Unknown", duration: info.duration ?? 0 };
  } catch {
    return { title: `YouTube ${videoId}`, duration: 0 };
  }
}

async function downloadVideo(videoId: string, outputPath: string): Promise<boolean> {
  console.log(`  Downloading video via proxy (may take 2-3 min)...`);
  try {
    const output = await runCmdWithOutput(PYTHON, [FETCH_SCRIPT, videoId, "download", outputPath], 600);
    const result = JSON.parse(output.trim());
    return result.success === true;
  } catch (e: any) {
    console.log(`  Download failed: ${e.message?.slice(0, 100)}`);
    return false;
  }
}

// === Render ===
async function renderVideo(projectId: string, timeline: any): Promise<string> {
  const tmpDir = path.join("/tmp/clip-mounter-v2", `render-${projectId}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  const concatList: string[] = [];

  for (let i = 0; i < timeline.segments.length; i++) {
    const seg = timeline.segments[i];
    const videoFile = path.join(VIDEOS_DIR, `${seg.videoId}.mp4`);

    if (!fs.existsSync(videoFile)) {
      console.log(`  Video ${seg.videoId} not downloaded, downloading now...`);
      const success = await downloadVideo(seg.videoId, videoFile);
      if (!success) throw new Error(`Failed to download video ${seg.videoId}`);
    }

    const segPath = path.join(tmpDir, `seg-${String(i).padStart(3, "0")}.mp4`);

    // Cut the segment with normalization
    const args = ["ffmpeg", "-y", "-ss", String(seg.trimStart)];
    if (seg.trimEnd !== null) args.push("-to", String(seg.trimEnd));
    args.push(
      "-i", videoFile,
      "-c:v", "libx264", "-pix_fmt", "yuv420p",
      "-vf", "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,fps=30",
      "-c:a", "aac", "-b:a", "128k",
      "-movflags", "+faststart",
      segPath,
    );
    await runCmd(args[0], args.slice(1), 120);
    concatList.push(`file '${segPath}'`);
    console.log(`  Cut segment ${i + 1}/${timeline.segments.length}`);
  }

  // Concat — use absolute paths and create the list file
  const listPath = path.join(tmpDir, "concat.txt");
  const listContent = concatList.join("\n");
  fs.writeFileSync(listPath, listContent);
  console.log(`  Concat list written to ${listPath} (${concatList.length} entries)`);

  const outputPath = path.join(OUTPUTS_DIR, `${projectId}.mp4`);
  fs.mkdirSync(OUTPUTS_DIR, { recursive: true });
  await runCmd("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outputPath], 120);

  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
    throw new Error("Render produced empty file");
  }

  const size = fs.statSync(outputPath).size;
  console.log(`  Output: ${size} bytes (${(size / 1024 / 1024).toFixed(1)} MB)`);

  // Upload output MP4 to Railway
  console.log(`  Uploading to Railway...`);
  await uploadOutput(projectId, outputPath);

  try { fs.rmSync(tmpDir, { recursive: true }); } catch {}
  return `${projectId}.mp4`;
}

function uploadOutput(projectId: string, filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const data = fs.readFileSync(filePath);
    const u = new URL(`${RAILWAY_URL}/api/projects/${projectId}/output`);
    const req = https.request({
      hostname: u.hostname, port: 443, path: u.pathname, method: "POST",
      headers: { "Content-Type": "video/mp4", "Content-Length": data.length },
    }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => {
        console.log(`  Upload response: ${res.statusCode} ${d.substring(0, 100)}`);
        if (res.statusCode === 200) resolve();
        else reject(new Error(`Upload failed: ${res.statusCode}`));
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

// === Main loop ===
async function main() {
  fs.mkdirSync(VIDEOS_DIR, { recursive: true });
  fs.mkdirSync(OUTPUTS_DIR, { recursive: true });
  console.log(`[vps-worker-v2] Started. Railway: ${RAILWAY_URL}`);
  console.log(`[vps-worker-v2] Python: ${PYTHON}`);
  console.log(`[vps-worker-v2] Fetch script: ${FETCH_SCRIPT}`);

  while (true) {
    try {
      const jobs = await httpGet(`${RAILWAY_URL}/api/transcription-jobs`) as any;

      // 1. Process videos needing transcript
      for (const v of (jobs.needsDownload ?? [])) {
        console.log(`\n[vps-worker] Processing: ${v.youtube_url}`);

        // Get transcript (via free proxy)
        const { segments, transcript } = await fetchTranscript(v.youtube_id);

        // Get video info (title + duration)
        const { title, duration } = await fetchVideoInfo(v.youtube_id);

        console.log(`  Title: ${title}, Duration: ${duration}s, Segments: ${segments.length}`);

        // Update Railway
        await httpPatch(`${RAILWAY_URL}/api/videos/${v.id}`, {
          title,
          duration,
          storage_path: `${v.id}.mp4`, // Will be downloaded at render time
          transcript,
          transcript_status: segments.length > 0 ? "done" : "error",
        });

        if (segments.length > 0) {
          console.log(`  ✓ Transcript sent to Railway`);
        } else {
          console.log(`  ✗ No transcript available`);
        }
      }

      // 2. Check for render jobs
      const renderJobs = await httpGet(`${RAILWAY_URL}/api/render-jobs`) as any;
      for (const job of (renderJobs.jobs ?? [])) {
        console.log(`\n[vps-worker] Rendering: ${job.project_id}`);
        const project = await httpGet(`${RAILWAY_URL}/api/projects/${job.project_id}`) as any;
        if (!project?.project?.timeline_json) continue;

        const timeline = JSON.parse(project.project.timeline_json);
        try {
          const outputPath = await renderVideo(job.project_id, timeline);
          console.log(`  ✓ Rendered: ${outputPath}`);
          await httpPatch(`${RAILWAY_URL}/api/projects/${job.project_id}`, {
            status: "done", output_path: outputPath, error: null,
          });
        } catch (e: any) {
          console.log(`  ✗ Render failed: ${e.message}`);
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