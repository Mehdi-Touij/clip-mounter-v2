// GET /api/niches/[id]/scenes?q=... — search the scene index (transcript segments)
// across every transcribed video in the niche. Keyword match for now; semantic (vector)
// search is Phase 2b.
import { NextRequest, NextResponse } from "next/server";
import { listNicheVideos } from "@/lib/db";

interface Seg { start: number; end: number; text: string }
interface Scene { videoId: string; videoTitle: string; channel: string; start: number; end: number; text: string }

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();

  const videos = (await listNicheVideos(id)).filter((v) => v.transcript_status === "done" && v.transcript_json);
  const scenes: Scene[] = [];

  for (const v of videos) {
    let segs: Seg[] = [];
    try { segs = JSON.parse(v.transcript_json) as Seg[]; } catch { continue; }
    for (const s of segs) {
      const text = (s.text || "").trim();
      if (!text) continue;
      if (q && !text.toLowerCase().includes(q)) continue;
      scenes.push({ videoId: v.id, videoTitle: v.title, channel: v.channel, start: s.start, end: s.end, text });
      if (scenes.length >= 60) break;
    }
    if (scenes.length >= 60) break;
  }

  return NextResponse.json({ scenes, indexedVideos: videos.length, query: q });
}
