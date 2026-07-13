// GET /api/niches/[id]    — niche + channels + sources
// PATCH /api/niches/[id]  — update niche settings
// DELETE /api/niches/[id] — delete niche (+ its channels/sources)
import { NextRequest, NextResponse } from "next/server";
import { getNiche, updateNiche, deleteNiche, listChannels, listSources } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const niche = await getNiche(id);
  if (!niche) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ niche, channels: await listChannels(id), sources: await listSources(id) });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await updateNiche(id, await req.json());
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deleteNiche(id);
  return NextResponse.json({ ok: true });
}
