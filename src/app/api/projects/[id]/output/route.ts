// GET /api/projects/[id]/output — serve the rendered MP4 from VPS
import { NextRequest, NextResponse } from "next/server";
import { getProject } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project || !project.output_path) return new NextResponse("Not found", { status: 404 });

  // The output file is on the VPS — redirect to VPS output URL
  const vpsUrl = process.env.VPS_OUTPUT_URL ?? "";
  if (vpsUrl) {
    return NextResponse.redirect(`${vpsUrl}/outputs/${project.output_path}`);
  }

  return new NextResponse("Output not available", { status: 404 });
}