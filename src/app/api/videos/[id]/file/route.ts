// GET /api/videos/[id]/file — stream the downloaded SOURCE video with HTTP range
// support, so the browser-side editor can scrub/seek it for live preview.
import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { Readable } from "stream";
import { getVideo, PATHS } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const video = await getVideo(id);
  if (!video || video.download_status !== "downloaded" || !video.storage_path) {
    return new NextResponse("Not found", { status: 404 });
  }

  const filePath = path.join(PATHS.videosDir, path.basename(video.storage_path));
  if (!fs.existsSync(filePath)) return new NextResponse("File not found", { status: 404 });

  const size = fs.statSync(filePath).size;
  const range = req.headers.get("range");

  const baseHeaders: Record<string, string> = {
    "Content-Type": "video/mp4",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
  };

  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = m && m[1] ? parseInt(m[1], 10) : 0;
    let end = m && m[2] ? parseInt(m[2], 10) : size - 1;
    if (Number.isNaN(start) || start < 0) start = 0;
    if (Number.isNaN(end) || end >= size) end = size - 1;
    if (start > end) return new NextResponse("Range Not Satisfiable", { status: 416, headers: { "Content-Range": `bytes */${size}` } });

    const stream = fs.createReadStream(filePath, { start, end });
    return new NextResponse(Readable.toWeb(stream) as unknown as ReadableStream, {
      status: 206,
      headers: {
        ...baseHeaders,
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Length": String(end - start + 1),
      },
    });
  }

  const stream = fs.createReadStream(filePath);
  return new NextResponse(Readable.toWeb(stream) as unknown as ReadableStream, {
    status: 200,
    headers: { ...baseHeaders, "Content-Length": String(size) },
  });
}
