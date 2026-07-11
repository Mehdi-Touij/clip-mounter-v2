// POST /api/projects/[id]/output — receive rendered MP4 from VPS worker
import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { getProject, updateProject } from "@/lib/db";

const OUTPUTS_DIR = process.env.OUTPUTS_DIR ?? path.join(process.cwd(), "outputs");

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Read the body as a file
  const body = await req.arrayBuffer();
  const buffer = Buffer.from(body);

  if (buffer.length === 0) {
    return NextResponse.json({ error: "Empty file" }, { status: 400 });
  }

  // Save to outputs directory
  fs.mkdirSync(OUTPUTS_DIR, { recursive: true });
  const filename = `${id}.mp4`;
  const filePath = path.join(OUTPUTS_DIR, filename);
  fs.writeFileSync(filePath, buffer);

  // Update project
  await updateProject(id, { status: "done", output_path: filename, error: null });

  return NextResponse.json({ ok: true, size: buffer.length });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project || !project.output_path) return new NextResponse("Not found", { status: 404 });

  const filePath = path.join(OUTPUTS_DIR, project.output_path);
  if (!fs.existsSync(filePath)) return new NextResponse("File not found", { status: 404 });

  const data = fs.readFileSync(filePath);
  return new NextResponse(data, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": data.length.toString(),
    },
  });
}