// POST /api/niches/[id]/reindex — clear scenes + re-index (worker rebuilds with visuals)
import { NextRequest, NextResponse } from "next/server";
import { reindexNiche } from "@/lib/db";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const videos = await reindexNiche(id);
  return NextResponse.json({ ok: true, videos });
}
