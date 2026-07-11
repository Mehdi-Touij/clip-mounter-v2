// GET /api/projects/[id]/output — stream the rendered MP4 from the persistent
// outputs dir. (The worker now writes the file locally; there is no upload step.)
import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { getProject, PATHS } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project || !project.output_path) return new NextResponse("Not found", { status: 404 });

  // Guard against traversal — only ever serve a bare filename from outputsDir.
  const filePath = path.join(PATHS.outputsDir, path.basename(project.output_path));
  if (!fs.existsSync(filePath)) return new NextResponse("File not found", { status: 404 });

  const data = fs.readFileSync(filePath);
  return new NextResponse(data as unknown as BodyInit, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": data.length.toString(),
      "Content-Disposition": `inline; filename="${path.basename(filePath)}"`,
      "Accept-Ranges": "bytes",
    },
  });
}
