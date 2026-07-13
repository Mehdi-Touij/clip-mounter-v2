// GET /api/videos/[id]/file — serve the downloaded SOURCE video with HTTP range support
// for the browser editor's live preview. Serves BOUNDED chunks as a buffer (not an open
// stream) — media elements read slowly and stall an open Node stream via backpressure;
// bounded buffered ranges avoid that and let the player request more as it needs.
import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as fsp from "fs/promises";
import * as path from "path";
import { getVideo, PATHS } from "@/lib/db";

const CHUNK = 1024 * 1024; // 1 MB cap per open-ended range request

async function readSlice(filePath: string, start: number, end: number): Promise<Buffer> {
  const fh = await fsp.open(filePath, "r");
  try {
    const len = end - start + 1;
    const buf = Buffer.allocUnsafe(len);
    await fh.read(buf, 0, len, start);
    return buf;
  } finally {
    await fh.close();
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const video = await getVideo(id);
  if (!video || video.download_status !== "downloaded" || !video.storage_path) {
    return new NextResponse("Not found", { status: 404 });
  }
  const filePath = path.join(PATHS.videosDir, path.basename(video.storage_path));
  if (!fs.existsSync(filePath)) return new NextResponse("File not found", { status: 404 });

  const size = fs.statSync(filePath).size;
  const range = req.headers.get("range");

  const headers: Record<string, string> = {
    "Content-Type": "video/mp4",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
  };

  const m = range ? /bytes=(\d*)-(\d*)/.exec(range) : null;
  let start = m && m[1] ? parseInt(m[1], 10) : 0;
  let end = m && m[2] ? parseInt(m[2], 10) : -1;
  if (Number.isNaN(start) || start < 0) start = 0;
  if (start >= size) return new NextResponse("Range Not Satisfiable", { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  // Open-ended (or too-large) range → cap to a 1MB chunk so the player gets a fast,
  // complete response and asks for more as needed.
  if (end < 0 || end >= size) end = Math.min(start + CHUNK - 1, size - 1);
  if (end < start) end = start;

  const body = await readSlice(filePath, start, end);
  return new NextResponse(body as unknown as BodyInit, {
    status: 206,
    headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
  });
}
