// GET /api/projects/[id] — get project
// PATCH /api/projects/[id] — update script
import { NextRequest, NextResponse } from "next/server";
import { getProject, updateProject } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ project });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { script, status, timeline_json, output_path, error } = await req.json();
  const updates: Record<string, unknown> = {};
  if (script !== undefined) updates.script = script;
  if (status !== undefined) updates.status = status;
  if (timeline_json !== undefined) updates.timeline_json = timeline_json;
  if (output_path !== undefined) updates.output_path = output_path;
  if (error !== undefined) updates.error = error;
  await updateProject(id, updates);
  return NextResponse.json({ ok: true });
}