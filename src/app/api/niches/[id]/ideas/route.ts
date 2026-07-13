// GET /api/niches/[id]/ideas — current suggested video ideas
import { NextRequest, NextResponse } from "next/server";
import { listIdeas } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json({ ideas: await listIdeas(id) });
}
