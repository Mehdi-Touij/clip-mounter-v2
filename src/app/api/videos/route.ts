// POST /api/videos — submit a YouTube link (or multiple links)
// GET /api/videos — list all videos
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { insertVideo, listVideos } from "@/lib/db";

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

export async function GET() {
  const videos = await listVideos();
  return NextResponse.json({ videos });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const urls: string[] = body.urls ?? (body.url ? [body.url] : []);

  if (urls.length === 0) {
    return NextResponse.json({ error: "No URLs provided" }, { status: 400 });
  }

  const added: { id: string; youtube_id: string; title: string }[] = [];
  const errors: string[] = [];

  for (const url of urls) {
    const ytId = extractYouTubeId(url);
    if (!ytId) {
      errors.push(`Invalid YouTube URL: ${url}`);
      continue;
    }

    const id = randomUUID();
    const title = `YouTube ${ytId}`; // Will be updated by worker after download

    await insertVideo({
      id,
      youtube_url: url,
      youtube_id: ytId,
      title,
      channel: "",
      duration: 0,
      thumbnail_url: `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`,
      storage_path: "",
      transcript: "",
      transcript_json: "",
      transcript_status: "pending",
    });

    added.push({ id, youtube_id: ytId, title });
  }

  return NextResponse.json({ added, errors });
}