// POST /api/niches/[id]/news/refresh — pull all RSS sources and store recent items
import { NextRequest, NextResponse } from "next/server";
import { getNiche, listSources, upsertNews, listNews } from "@/lib/db";
import { fetchFeed } from "@/lib/news";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getNiche(id))) return NextResponse.json({ error: "Niche not found" }, { status: 404 });
  const sources = (await listSources(id)).filter((s) => s.type === "rss");
  if (sources.length === 0) return NextResponse.json({ error: "Add an RSS news source first" }, { status: 400 });

  let count = 0;
  const errors: string[] = [];
  for (const s of sources) {
    try {
      let host = s.url; try { host = new URL(s.url).hostname.replace(/^www\./, ""); } catch {}
      const items = await fetchFeed(s.url);
      for (const it of items) { await upsertNews(id, { ...it, source: s.title || host }); count++; }
    } catch (e) { errors.push(`${s.title}: ${(e as Error).message}`.slice(0, 140)); }
  }
  return NextResponse.json({ fetched: count, news: await listNews(id, 40), errors });
}
