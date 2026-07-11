// POST /api/projects/[id]/render — enqueue a render job
import { NextRequest, NextResponse } from "next/server";
import { getProject, updateProject, insertRenderJob, getVideo } from "@/lib/db";
import type { Timeline } from "@/lib/types";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!project.timeline_json) return NextResponse.json({ error: "No timeline — run Plan with AI first." }, { status: 400 });

  // Don't queue a render that will fail: every referenced video must be downloaded.
  const timeline = JSON.parse(project.timeline_json) as Timeline;
  const ids = [...new Set(timeline.segments.map((s) => s.videoId))];
  const notReady: string[] = [];
  for (const vid of ids) {
    const v = await getVideo(vid);
    if (!v || v.download_status !== "downloaded") notReady.push(v?.title ?? vid);
  }
  if (notReady.length > 0) {
    return NextResponse.json(
      { error: `Still preparing: ${notReady.join(", ")}. Wait until every clip is downloaded, then render.` },
      { status: 409 },
    );
  }

  const jobId = await insertRenderJob(id);
  await updateProject(id, { status: "rendering", error: null });
  return NextResponse.json({ jobId });
}
