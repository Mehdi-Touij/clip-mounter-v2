// POST /api/videos/[id]/transcript — receive transcript from VPS worker
import { NextRequest, NextResponse } from "next/server";
import { updateVideoTranscript } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { transcript } = await req.json();
  const status = transcript && transcript.trim() ? "done" : "done";
  await updateVideoTranscript(id, transcript ?? "", "", status);
  return NextResponse.json({ ok: true });
}