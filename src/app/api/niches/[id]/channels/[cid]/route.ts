// DELETE /api/niches/[id]/channels/[cid] — remove a competitor channel
import { NextRequest, NextResponse } from "next/server";
import { deleteChannel } from "@/lib/db";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; cid: string }> }) {
  const { cid } = await params;
  await deleteChannel(cid);
  return NextResponse.json({ ok: true });
}
