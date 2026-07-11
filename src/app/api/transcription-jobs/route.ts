// GET /api/transcription-jobs — list videos needing download + transcription (for VPS worker)
import { NextResponse } from "next/server";
import { listVideosNeedingDownload, listVideosNeedingTranscript } from "@/lib/db";

export async function GET() {
  const needsDownload = await listVideosNeedingDownload();
  const needsTranscript = await listVideosNeedingTranscript();
  return NextResponse.json({
    needsDownload: needsDownload.map((v) => ({ id: v.id, youtube_url: v.youtube_url, youtube_id: v.youtube_id })),
    needsTranscript: needsTranscript.filter(v => v.storage_path).map((v) => ({ id: v.id, name: v.title })),
  });
}