// GET  /api/niches/[id]/videos — list videos indexed under this niche
// POST /api/niches/[id]/videos — add a competitor video (ingested by the worker)
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getNiche, insertVideo, listNicheVideos } from "@/lib/db";

function extractYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const videos = (await listNicheVideos(id)).map((v) => ({
    id: v.id, title: v.title, channel: v.channel, thumbnail_url: v.thumbnail_url,
    duration: v.duration, transcript_status: v.transcript_status, download_status: v.download_status,
  }));
  return NextResponse.json({ videos });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getNiche(id))) return NextResponse.json({ error: "Niche not found" }, { status: 404 });
  const body = await req.json();
  const urls: string[] = body.urls ?? (body.url ? [body.url] : []);
  const errors: string[] = [];
  for (const url of urls) {
    const ytId = extractYouTubeId(url);
    if (!ytId) { errors.push(`Invalid URL: ${url}`); continue; }
    await insertVideo({
      id: randomUUID(),
      youtube_url: url,
      youtube_id: ytId,
      title: `YouTube ${ytId}`,
      thumbnail_url: `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`,
      niche_id: id,
    });
  }
  return NextResponse.json({ videos: (await listNicheVideos(id)).length, errors });
}
