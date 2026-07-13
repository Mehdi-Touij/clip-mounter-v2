// GET /api/niches/[id]/scenes?q=... — search the scene index.
// Semantic (vector) ranking when scenes are embedded; falls back to keyword over raw
// transcripts while a video is still being indexed.
import { NextRequest, NextResponse } from "next/server";
import { listNicheSceneRows, listNicheVideos } from "@/lib/db";
import { embed, cosine } from "@/lib/embeddings";

interface Seg { start: number; end: number; text: string }
interface Scene { videoId: string; videoTitle: string; channel: string; start: number; end: number; text: string; score?: number }

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();

  const rows = await listNicheSceneRows(id);

  // Semantic path — scenes have embeddings.
  if (rows.length > 0) {
    const indexedVideos = new Set(rows.map((r) => r.video_id)).size;
    if (!q) {
      const scenes = rows.slice(0, 40).map((r) => ({ videoId: r.video_id, videoTitle: r.video_title, channel: r.channel, start: r.start, end: r.end, text: r.text }));
      return NextResponse.json({ scenes, indexedVideos, mode: "browse" });
    }
    const qv = await embed(q);
    const scored: Scene[] = rows.map((r) => {
      let emb: number[] = [];
      try { emb = JSON.parse(r.embedding); } catch {}
      return { videoId: r.video_id, videoTitle: r.video_title, channel: r.channel, start: r.start, end: r.end, text: r.text, score: cosine(qv, emb) };
    });
    scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    return NextResponse.json({ scenes: scored.slice(0, 40), indexedVideos, mode: "semantic" });
  }

  // Fallback — keyword over transcripts (before embeddings are ready).
  const videos = (await listNicheVideos(id)).filter((v) => v.transcript_status === "done" && v.transcript_json);
  const ql = q.toLowerCase();
  const scenes: Scene[] = [];
  for (const v of videos) {
    let segs: Seg[] = [];
    try { segs = JSON.parse(v.transcript_json) as Seg[]; } catch { continue; }
    for (const s of segs) {
      const text = (s.text || "").trim();
      if (!text || (q && !text.toLowerCase().includes(ql))) continue;
      scenes.push({ videoId: v.id, videoTitle: v.title, channel: v.channel, start: s.start, end: s.end, text });
      if (scenes.length >= 60) break;
    }
    if (scenes.length >= 60) break;
  }
  return NextResponse.json({ scenes, indexedVideos: videos.length, mode: "keyword" });
}
