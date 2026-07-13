// PATCH /api/projects/[id]/publish — save edits to publish metadata / schedule / status
import { NextRequest, NextResponse } from "next/server";
import { getProject, updateProject } from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const existing = (() => { try { return JSON.parse(project.publish_json ?? "{}"); } catch { return {}; } })();
  const publish = { ...existing };
  for (const k of ["title", "description", "tags", "status", "scheduledAt", "publishedUrl"]) {
    if (body[k] !== undefined) publish[k] = body[k];
  }
  await updateProject(id, { publish_json: JSON.stringify(publish) });
  return NextResponse.json({ publish });
}
