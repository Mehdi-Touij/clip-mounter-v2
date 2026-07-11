// POST /api/projects — create project
// GET /api/projects — list projects
import { NextRequest, NextResponse } from "next/server";
import { insertProject, listProjects } from "@/lib/db";

export async function GET() {
  const projects = await listProjects();
  return NextResponse.json({ projects });
}

export async function POST(req: NextRequest) {
  const { name, sourceVideoId } = await req.json();
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });
  if (!sourceVideoId) return NextResponse.json({ error: "Pick a source video to recreate" }, { status: 400 });
  const id = await insertProject(name, sourceVideoId);
  return NextResponse.json({ id, name });
}