// Local SQLite database — stores videos, transcripts, projects, render jobs.
import * as nodePath from "path";

const DB_PATH = nodePath.join(process.cwd(), "db", "clip-mounter.db");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _db: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getDb(): Promise<any> {
  if (_db) return _db;
  const mod: any = await import("better-sqlite3");
  const Database = mod.default ?? mod;
  const fs = await import("fs");
  fs.mkdirSync(nodePath.dirname(DB_PATH), { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  initSchema(_db);
  return _db;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function initSchema(db: any) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS videos (
      id              TEXT PRIMARY KEY,
      youtube_url     TEXT NOT NULL,
      youtube_id      TEXT NOT NULL,
      title           TEXT NOT NULL,
      channel         TEXT DEFAULT '',
      duration        REAL DEFAULT 0,
      thumbnail_url   TEXT DEFAULT '',
      storage_path    TEXT DEFAULT '',
      transcript      TEXT DEFAULT '',
      transcript_json TEXT DEFAULT '',
      transcript_status TEXT DEFAULT 'pending',
      created_at      TEXT DEFAULT (datetime('now'))
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
      status      TEXT DEFAULT 'queued',
      error       TEXT,
      created_at  TEXT DEFAULT (datetime('now'))
    );
  `);
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
  created_at: string;
}

export async function insertVideo(v: Omit<VideoRow, "created_at">): Promise<void> {
  const db = await getDb();
  db.prepare(`INSERT INTO videos (id, youtube_url, youtube_id, title, channel, duration, thumbnail_url, storage_path, transcript, transcript_json, transcript_status)
    VALUES (@id, @youtube_url, @youtube_id, @title, @channel, @duration, @thumbnail_url, @storage_path, @transcript, @transcript_json, @transcript_status)`).run(v);
}

export async function listVideos(): Promise<VideoRow[]> {
  const db = await getDb();
  return db.prepare("SELECT * FROM videos ORDER BY created_at DESC").all() as VideoRow[];
}

export async function getVideo(id: string): Promise<VideoRow | null> {
  const db = await getDb();
  return db.prepare("SELECT * FROM videos WHERE id = ?").get(id) as VideoRow ?? null;
}

export async function updateVideoTranscript(id: string, transcript: string, transcriptJson: string, status: string): Promise<void> {
  const db = await getDb();
  db.prepare("UPDATE videos SET transcript = ?, transcript_json = ?, transcript_status = ? WHERE id = ?").run(transcript, transcriptJson, status, id);
}

export async function listVideosNeedingTranscript(): Promise<VideoRow[]> {
  const db = await getDb();
  return db.prepare("SELECT * FROM videos WHERE transcript_status = 'pending' OR transcript_status = 'downloading'").all() as VideoRow[];
}

export async function listVideosNeedingDownload(): Promise<VideoRow[]> {
  const db = await getDb();
  return db.prepare("SELECT * FROM videos WHERE storage_path = '' OR storage_path IS NULL").all() as VideoRow[];
}

export async function updateVideoStorage(id: string, storagePath: string, duration: number): Promise<void> {
  const db = await getDb();
  db.prepare("UPDATE videos SET storage_path = ?, duration = ? WHERE id = ?").run(storagePath, duration, id);
}

export async function deleteVideo(id: string): Promise<void> {
  const db = await getDb();
  db.prepare("DELETE FROM videos WHERE id = ?").run(id);
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
  return db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as ProjectRow ?? null;
}

export async function updateProject(id: string, updates: Partial<ProjectRow>): Promise<void> {
  const db = await getDb();
  const fields = Object.keys(updates).filter(k => k !== "id" && k !== "created_at");
  if (fields.length === 0) return;
  const sets = fields.map(f => `${f} = @${f}`).join(", ");
  const values: Record<string, unknown> = { id, ...updates };
  db.prepare(`UPDATE projects SET ${sets} WHERE id = @id`).run(values);
}

// === Render job operations ===

export interface RenderJobRow {
  id: string;
  project_id: string;
  status: string;
  error: string | null;
  created_at: string;
}

export async function insertRenderJob(projectId: string): Promise<string> {
  const db = await getDb();
  const { randomUUID } = await import("crypto");
  const id = randomUUID();
  db.prepare("INSERT INTO render_jobs (id, project_id) VALUES (?, ?)").run(id, projectId);
  return id;
}

export async function claimNextJob(): Promise<RenderJobRow | null> {
  const db = await getDb();
  const job = db.prepare("SELECT * FROM render_jobs WHERE status = 'queued' ORDER BY created_at LIMIT 1").get() as RenderJobRow | undefined;
  if (!job) return null;
  db.prepare("UPDATE render_jobs SET status = 'processing' WHERE id = ?").run(job.id);
  return job;
}

export async function updateJob(jobId: string, status: string, error?: string): Promise<void> {
  const db = await getDb();
  db.prepare("UPDATE render_jobs SET status = ?, error = ? WHERE id = ?").run(status, error ?? null, jobId);
}