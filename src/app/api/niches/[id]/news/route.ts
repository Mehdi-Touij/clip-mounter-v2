// GET /api/niches/[id]/news — recent news items for the niche
import { NextRequest, NextResponse } from "next/server";
import { listNews } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json({ news: await listNews(id, 40) });
}
