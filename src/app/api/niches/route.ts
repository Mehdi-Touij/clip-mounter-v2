// GET /api/niches — list niches
// POST /api/niches — create a niche
import { NextRequest, NextResponse } from "next/server";
import { listNiches, insertNiche } from "@/lib/db";

export async function GET() {
  return NextResponse.json({ niches: await listNiches() });
}

export async function POST(req: NextRequest) {
  const b = await req.json();
  if (!b?.name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });
  const id = await insertNiche({
    name: b.name.trim(),
    description: (b.description ?? "").trim(),
    language: b.language || "en",
    format: b.format === "long" ? "long" : "shorts",
    videos_per_day: Math.max(1, Math.min(24, parseInt(b.videos_per_day ?? 4, 10) || 4)),
  });
  return NextResponse.json({ id });
}
