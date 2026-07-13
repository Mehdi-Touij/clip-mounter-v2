// POST /api/niches/[id]/channels — add a competitor channel by URL/handle
import { NextRequest, NextResponse } from "next/server";
import { getNiche, addChannel, listChannels } from "@/lib/db";

// Pull a readable handle from a channel URL (@handle, /channel/ID, /c/name, /user/name, or a bare @handle).
function parseHandle(input: string): string {
  const s = input.trim();
  const at = s.match(/@([A-Za-z0-9._-]+)/);
  if (at) return "@" + at[1];
  const m = s.match(/youtube\.com\/(?:channel\/|c\/|user\/)?([A-Za-z0-9._-]+)/i);
  if (m) return m[1];
  return s;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getNiche(id))) return NextResponse.json({ error: "Niche not found" }, { status: 404 });
  const { url } = await req.json();
  if (!url?.trim()) return NextResponse.json({ error: "Channel URL or @handle required" }, { status: 400 });
  const handle = parseHandle(url);
  await addChannel(id, url.trim(), handle);
  return NextResponse.json({ channels: await listChannels(id) });
}
