// DELETE /api/niches/[id]/sources/[sid] — remove a news source
import { NextRequest, NextResponse } from "next/server";
import { deleteSource } from "@/lib/db";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; sid: string }> }) {
  const { sid } = await params;
  await deleteSource(sid);
  return NextResponse.json({ ok: true });
}
