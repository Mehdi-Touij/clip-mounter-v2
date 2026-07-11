// Local SQLite database — stores videos, transcripts, projects, render jobs.
// Collapsed architecture: the Next.js app AND the worker run on the same VPS
// and open this same DB file directly (WAL mode → safe multi-process access).
import * as nodePath from "path";

// DB lives under a persistent data dir (mounted volume on the VPS), NOT the
// container/app dir — so it survives restarts.
const DATA_DIR = process.env.DATA_DIR ?? nodePath.join(process.cwd(), "data");
const DB_PATH = process.env.DB_PATH ?? nodePath.join(DATA_DIR, "clip-mounter.db");

export const PATHS = {
  dataDir: DATA_DIR,
  dbPath: DB_PATH,
  videosDir: process.env.VIDEOS_DIR ?? nodePath.join(DATA_DIR, "videos"),
  outputsDir: process.env.OUTPUTS_DIR ?? nodePath.join(DATA_DIR, "outputs"),
};

export const MAX_ATTEMPTS = parseInt(process.env.MAX_ATTEMPTS ?? "4", 10);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _db: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getDb(): Promise<any> {
  if (_db) return _db;
  const mod: any = await import("better-sqlite3");
  const Database = mod.default ?? mod;
  const fs = await import("fs");
  fs.mkdirSync(nodePath.dirname(DB_PATH), { recursive: true });
  fs.mkdirSync(PATHS.videosDir, { recursive: true });
  fs.mkdirSync(PATHS.outputsDir, { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  // Let concurrent web+worker writers wait for the lock instead of throwing.
  _db.pragma("busy_timeout = 5000");
  initSchema(_db);
  return _db;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function initSchema(db: any) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS videos (
      id                TEXT PRIMARY KEY,
      youtube_url       TEXT NOT NULL,
      youtube_id        TEXT NOT NULL,
      title             TEXT NOT NULL,
      channel           TEXT DEFAULT '',
      duration          REAL DEFAULT 0,
      thumbnail_url     TEXT DEFAULT '',
      storage_path      TEXT DEFAULT '',
      transcript        TEXT DEFAULT '',
      transcript_json   TEXT DEFAULT '',
      transcript_status TEXT DEFAULT 'pending',   -- pending | fetching | done | error
      download_status   TEXT DEFAULT 'pending',   -- pending | downloading | downloaded | error
      attempts          INTEGER DEFAULT 0,
      last_error        TEXT DEFAULT '',
      created_at        TEXT DEFAULT (datetime('now')),
      updated_at        TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS projects (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      script        TEXT DEFAULT '',
      status        TEXT DEFAULT 'draft',
      timeline_json TEXT,
      output_path   TEXT,
      error         TEXT,
      created_at    TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS render_jobs (
      id          TEXT PRIMARY KEY,
      project_id  TEXT NOT NULL,
      status      TEXT DEFAULT 'queued',   -- queued | processing | done | error
      attempts    INTEGER DEFAULT 0,
      error       TEXT,
      created_at  TEXT DEFAULT (datetime('now')),
      updated_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_videos_transcript_status ON videos(transcript_status);
    CREATE INDEX IF NOT EXISTS idx_videos_download_status ON videos(download_status);
    CREATE INDEX IF NOT EXISTS idx_render_jobs_status ON render_jobs(status);
  `);

  // Lightweight migration for older DBs that predate the new columns.
  const cols = db.prepare("PRAGMA table_info(videos)").all().map((c: { name: string }) => c.name);
  const add = (name: string, ddl: string) => {
    if (!cols.includes(name)) db.exec(`ALTER TABLE videos ADD COLUMN ${ddl}`);
  };
  add("download_status", "download_status TEXT DEFAULT 'pending'");
  add("attempts", "attempts INTEGER DEFAULT 0");
  add("last_error", "last_error TEXT DEFAULT ''");
  add("updated_at", "updated_at TEXT DEFAULT (datetime('now'))");

  const jobCols = db.prepare("PRAGMA table_info(render_jobs)").all().map((c: { name: string }) => c.name);
  if (!jobCols.includes("attempts")) db.exec("ALTER TABLE render_jobs ADD COLUMN attempts INTEGER DEFAULT 0");
  if (!jobCols.includes("updated_at")) db.exec("ALTER TABLE render_jobs ADD COLUMN updated_at TEXT DEFAULT (datetime('now'))");
}

// === Video operations ===

export interface VideoRow {
  id: string;
  youtube_url: string;
  youtube_id: string;
  title: string;
  channel: string;
  duration: number;
  thumbnail_url: string;
  storage_path: string;
  transcript: string;
  transcript_json: string;
  transcript_status: string;
  download_status: string;
  attempts: number;
  last_error: string;
  created_at: string;
  updated_at: string;
}

export async function insertVideo(
  v: Pick<VideoRow, "id" | "youtube_url" | "youtube_id" | "title" | "thumbnail_url">,
): Promise<void> {
  const db = await getDb();
  db.prepare(
    `INSERT INTO videos (id, youtube_url, youtube_id, title, thumbnail_url)
     VALUES (@id, @youtube_url, @youtube_id, @title, @thumbnail_url)`,
  ).run(v);
}

export async function listVideos(): Promise<VideoRow[]> {
  const db = await getDb();
  return db.prepare("SELECT * FROM videos ORDER BY created_at DESC").all() as VideoRow[];
}

export async function getVideo(id: string): Promise<VideoRow | null> {
  const db = await getDb();
  return (db.prepare("SELECT * FROM videos WHERE id = ?").get(id) as VideoRow) ?? null;
}

// Generic, whitelisted patch used by the worker + the API.
const VIDEO_PATCH_FIELDS = [
  "title", "channel", "duration", "thumbnail_url", "storage_path",
  "transcript", "transcript_json", "transcript_status",
  "download_status", "attempts", "last_error",
] as const;

export async function patchVideo(id: string, updates: Partial<VideoRow>): Promise<void> {
  const db = await getDb();
  const fields = Object.keys(updates).filter((k) => (VIDEO_PATCH_FIELDS as readonly string[]).includes(k));
  if (fields.length === 0) return;
  const sets = fields.map((f) => `${f} = @${f}`).join(", ");
  db.prepare(`UPDATE videos SET ${sets}, updated_at = datetime('now') WHERE id = @id`).run({ id, ...updates });
}

export async function deleteVideo(id: string): Promise<void> {
  const db = await getDb();
  db.prepare("DELETE FROM videos WHERE id = ?").run(id);
}

/** Videos still needing transcript or download work (and not exhausted). */
export async function listVideosNeedingWork(): Promise<VideoRow[]> {
  const db = await getDb();
  return db
    .prepare(
      `SELECT * FROM videos
       WHERE (transcript_status IN ('pending','fetching') OR download_status IN ('pending','downloading'))
         AND attempts < ?
       ORDER BY created_at ASC`,
    )
    .all(MAX_ATTEMPTS) as VideoRow[];
}

// === Project operations ===

export interface ProjectRow {
  id: string;
  name: string;
  script: string;
  status: string;
  timeline_json: string | null;
  output_path: string | null;
  error: string | null;
  created_at: string;
}

export async function insertProject(name: string): Promise<string> {
  const db = await getDb();
  const { randomUUID } = await import("crypto");
  const id = randomUUID();
  db.prepare("INSERT INTO projects (id, name) VALUES (?, ?)").run(id, name);
  return id;
}

export async function listProjects(): Promise<ProjectRow[]> {
  const db = await getDb();
  return db.prepare("SELECT * FROM projects ORDER BY created_at DESC").all() as ProjectRow[];
}

export async function getProject(id: string): Promise<ProjectRow | null> {
  const db = await getDb();
  return (db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as ProjectRow) ?? null;
}

export async function updateProject(id: string, updates: Partial<ProjectRow>): Promise<void> {
  const db = await getDb();
  const fields = Object.keys(updates).filter((k) => k !== "id" && k !== "created_at");
  if (fields.length === 0) return;
  const sets = fields.map((f) => `${f} = @${f}`).join(", ");
  db.prepare(`UPDATE projects SET ${sets} WHERE id = @id`).run({ id, ...updates });
}

// === Render job operations ===

export interface RenderJobRow {
  id: string;
  project_id: string;
  status: string;
  attempts: number;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export async function insertRenderJob(projectId: string): Promise<string> {
  const db = await getDb();
  const { randomUUID } = await import("crypto");
  const id = randomUUID();
  // Collapse duplicate queued jobs for the same project — re-clicking Render
  // should not enqueue N identical jobs.
  db.prepare("DELETE FROM render_jobs WHERE project_id = ? AND status = 'queued'").run(projectId);
  db.prepare("INSERT INTO render_jobs (id, project_id) VALUES (?, ?)").run(id, projectId);
  return id;
}

/**
 * Atomically claim the next queued job. This is the fix for the infinite
 * re-render loop: a claimed job moves to 'processing' in the SAME transaction
 * that selects it, so it can never be handed out twice.
 */
export async function claimNextRenderJob(): Promise<RenderJobRow | null> {
  const db = await getDb();
  const claim = db.transaction(() => {
    const job = db
      .prepare("SELECT * FROM render_jobs WHERE status = 'queued' ORDER BY created_at LIMIT 1")
      .get() as RenderJobRow | undefined;
    if (!job) return null;
    db.prepare(
      "UPDATE render_jobs SET status = 'processing', attempts = attempts + 1, updated_at = datetime('now') WHERE id = ?",
    ).run(job.id);
    return { ...job, status: "processing", attempts: job.attempts + 1 };
  });
  return claim();
}

export async function completeRenderJob(jobId: string, status: "done" | "error", error?: string): Promise<void> {
  const db = await getDb();
  db.prepare(
    "UPDATE render_jobs SET status = ?, error = ?, updated_at = datetime('now') WHERE id = ?",
  ).run(status, error ?? null, jobId);
}

/** Requeue jobs left 'processing' by a crashed worker (called on worker startup). */
export async function recoverStuckJobs(): Promise<number> {
  const db = await getDb();
  const res = db
    .prepare("UPDATE render_jobs SET status = 'queued', updated_at = datetime('now') WHERE status = 'processing'")
    .run();
  return res.changes as number;
}
