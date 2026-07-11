// GET /api/videos/[id]    — video details
// DELETE /api/videos/[id] — delete video + its downloaded file
import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { getVideo, deleteVideo, PATHS } from "@/lib/db";

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
  const video = await getVideo(id);
  await deleteVideo(id);
  // Best-effort cleanup of the downloaded file.
  if (video?.storage_path) {
    try { fs.rmSync(path.join(PATHS.videosDir, path.basename(video.storage_path)), { force: true }); } catch {}
  }
  return NextResponse.json({ ok: true });
}
