// GET /api/render-jobs — list queued render jobs (for VPS worker)
import { NextResponse } from "next/server";

export async function GET() {
  // Import db lazily
  const { claimNextJob } = await import("@/lib/db");
  // Don't claim — just list queued jobs
  const { getDb } = await import("@/lib/db");
  const db = await getDb();
  const jobs = db.prepare("SELECT * FROM render_jobs WHERE status = 'queued' ORDER BY created_at").all();
  return NextResponse.json({ jobs });
}