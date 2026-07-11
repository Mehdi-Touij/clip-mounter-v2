// POST /api/projects/[id]/plan — AI planner searches all transcripts, returns timeline
import { NextRequest, NextResponse } from "next/server";
import { getProject, updateProject, listVideos } from "@/lib/db";
import type { Timeline } from "@/lib/types";

const BASE_URL = process.env.PLANNER_BASE_URL ?? "https://ollama.com/v1";
const API_KEY = process.env.OLLAMA_API_KEY ?? process.env.PLANNER_API_KEY ?? "";
const MODEL = process.env.PLANNER_MODEL ?? "glm-5.2";

const SYSTEM_PROMPT = `You are a professional video editor. You are given a SCRIPT and a LIBRARY of YouTube videos. Each video has a transcript with timestamps showing what is said at each moment.

Your job: find the specific moments across ALL videos that match the script, and return a timeline JSON.

Rules:
- Search across ALL videos, not just one
- Find the exact time ranges where the transcript content matches each part of the script
- Pick specific moments — do NOT use the entire video
- You may use multiple segments from the same video
- Keep segments as long as needed to match the script
- Each segment must have: videoId, trimStart (seconds), trimEnd (seconds)
- Return ONLY valid JSON, no markdown`;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const videos = await listVideos();
  const readyVideos = videos.filter((v) => v.transcript && v.transcript.trim());

  if (readyVideos.length === 0) {
    return NextResponse.json({ error: "No transcribed videos in library. Wait for transcription to complete." }, { status: 400 });
  }

  const libraryText = readyVideos
    .map((v) => {
      return `VIDEO ${v.id} (${v.title}, duration: ${v.duration.toFixed(0)}s)\n  Transcript:\n${v.transcript.split("\n").map((line) => "    " + line).join("\n")}`;
    })
    .join("\n\n");

  const userPrompt = `SCRIPT:\n${project.script}\n\nVIDEO LIBRARY (${readyVideos.length} videos):\n${libraryText}\n\nReturn a JSON object: {"segments": [{"videoId": "...", "trimStart": 0, "trimEnd": 10, "reason": "..."}]}`;

  // Call LLM (with a hard timeout so the request can't hang forever).
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 120_000);
  let llmResp: Response;
  try {
    llmResp = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
      }),
      signal: ac.signal,
    });
  } catch (e) {
    return NextResponse.json({ error: `LLM request failed: ${(e as Error).message}` }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }

  if (!llmResp.ok) {
    return NextResponse.json({ error: `LLM error: ${llmResp.status}` }, { status: 502 });
  }

  const llmData = await llmResp.json();
  let content = llmData.choices?.[0]?.message?.content ?? "";

  // Extract JSON from response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return NextResponse.json({ error: "LLM did not return valid JSON" }, { status: 500 });
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return NextResponse.json({ error: "Failed to parse LLM JSON" }, { status: 500 });
  }

  // Validate + normalize the LLM's segments against the real library:
  // drop unknown video ids, backfill youtubeUrl, and clamp times to duration.
  const byId = new Map(readyVideos.map((v) => [v.id, v]));
  const segments = (Array.isArray(parsed.segments) ? parsed.segments : [])
    .map((s: { videoId?: string; trimStart?: number; trimEnd?: number | null; reason?: string }) => {
      const v = s.videoId ? byId.get(s.videoId) : undefined;
      if (!v) return null;
      const dur = v.duration || Number.MAX_SAFE_INTEGER;
      const start = Math.max(0, Math.min(Number(s.trimStart) || 0, dur));
      let end = s.trimEnd === null || s.trimEnd === undefined ? null : Math.min(Number(s.trimEnd), dur);
      if (end !== null && end <= start) end = null;
      return { videoId: v.id, youtubeUrl: v.youtube_url, trimStart: start, trimEnd: end, reason: s.reason ?? "" };
    })
    .filter(Boolean);

  if (segments.length === 0) {
    return NextResponse.json({ error: "AI produced no usable segments. Try rephrasing the script." }, { status: 422 });
  }

  const timeline: Timeline = { fps: 30, width: 1080, height: 1920, segments };
  await updateProject(id, { timeline_json: JSON.stringify(timeline), status: "planned" });
  return NextResponse.json({ timeline });
}