// POST /api/niches/[id]/channel-videos/[cvid]/index — pull a spied competitor video
// into the scene index (transcribe + download + embed via the existing pipeline).
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getChannelVideo, insertVideo, markChannelVideoIndexed } from "@/lib/db";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; cvid: string }> }) {
  const { id, cvid } = await params;
  const cv = await getChannelVideo(cvid);
  if (!cv) return NextResponse.json({ error: "Video not found" }, { status: 404 });

  await insertVideo({
    id: randomUUID(),
    youtube_url: `https://www.youtube.com/watch?v=${cv.youtube_id}`,
    youtube_id: cv.youtube_id,
    title: cv.title || `YouTube ${cv.youtube_id}`,
    thumbnail_url: cv.thumbnail || `https://img.youtube.com/vi/${cv.youtube_id}/hqdefault.jpg`,
    niche_id: id,
  });
  await markChannelVideoIndexed(cvid);
  return NextResponse.json({ ok: true });
}
