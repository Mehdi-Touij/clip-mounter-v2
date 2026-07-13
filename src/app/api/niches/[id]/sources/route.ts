// POST /api/niches/[id]/sources — add a news source (RSS or page)
import { NextRequest, NextResponse } from "next/server";
import { getNiche, addSource, listSources } from "@/lib/db";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getNiche(id))) return NextResponse.json({ error: "Niche not found" }, { status: 404 });
  const { url, type, title } = await req.json();
  if (!url?.trim()) return NextResponse.json({ error: "Feed or page URL required" }, { status: 400 });
  let host = url.trim();
  try { host = new URL(url.trim()).hostname.replace(/^www\./, ""); } catch {}
  await addSource(id, type === "page" ? "page" : "rss", url.trim(), (title || host).trim());
  return NextResponse.json({ sources: await listSources(id) });
}
