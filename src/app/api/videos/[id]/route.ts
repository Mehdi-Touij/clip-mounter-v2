// GET /api/videos/[id] — get video details
// DELETE /api/videos/[id] — delete video
// PATCH /api/videos/[id] — update video metadata (from VPS worker)
import { NextRequest, NextResponse } from "next/server";
import { getVideo, deleteVideo, getDb } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const video = await getVideo(id);
  if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ video });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await deleteVideo(id);
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const db = await getDb();
  const updates: string[] = [];
  const values: unknown[] = [];
  for (const key of ["title", "channel", "duration", "thumbnail_url", "storage_path", "transcript", "transcript_json", "transcript_status"]) {
    if (body[key] !== undefined) { updates.push(`${key} = ?`); values.push(body[key]); }
  }
  if (updates.length === 0) return NextResponse.json({ ok: true });
  values.push(id);
  db.prepare(`UPDATE videos SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  return NextResponse.json({ ok: true });
}