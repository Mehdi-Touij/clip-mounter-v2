// POST /api/projects/[id]/render — enqueue render job
import { NextRequest, NextResponse } from "next/server";
import { getProject, updateProject, insertRenderJob } from "@/lib/db";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!project.timeline_json) return NextResponse.json({ error: "No timeline" }, { status: 400 });

  const jobId = await insertRenderJob(id);
  await updateProject(id, { status: "rendering", error: null });
  return NextResponse.json({ jobId });
}