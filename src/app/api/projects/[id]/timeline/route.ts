// PATCH /api/projects/[id]/timeline — update timeline from video editor
import { NextRequest, NextResponse } from "next/server";
import { getProject, updateProject } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { timeline } = await req.json();
  if (!timeline?.segments || !Array.isArray(timeline.segments)) {
    return NextResponse.json({ error: "Invalid timeline" }, { status: 400 });
  }

  await updateProject(id, {
    timeline_json: JSON.stringify(timeline),
    status: "planned",
    output_path: null,
    error: null,
  });

  return NextResponse.json({ ok: true });
}