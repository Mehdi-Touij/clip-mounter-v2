// POST /api/projects/[id]/recreate
// Takes the project's SOURCE video, groups its transcript into topic-block scenes,
// rewords each scene (same meaning, new wording), and reshuffles scenes where it's
// safe — producing a new full-length variant. Cut timestamps come from OUR stored
// transcript (authoritative); the LLM only decides grouping, rewording, and order.
import { NextRequest, NextResponse } from "next/server";
import { getProject, getVideo, updateProject } from "@/lib/db";
import type { Timeline, TimelineSegment } from "@/lib/types";

const BASE_URL = process.env.PLANNER_BASE_URL ?? "https://ollama.com/v1";
const API_KEY = process.env.OLLAMA_API_KEY ?? process.env.PLANNER_API_KEY ?? "";
const MODEL = process.env.PLANNER_MODEL ?? "glm-5.2";

interface Seg { start: number; end: number; text: string }

const SYSTEM_PROMPT = `You are a video re-editor. You receive the full timestamped transcript of ONE video, as numbered cues.

Your job is to RECREATE the video as a fresh variant that keeps the SAME MEANING:
1. Group consecutive cues into coherent TOPIC-BLOCK scenes (a scene = a run of cues about one idea).
2. For each scene, REWRITE the spoken text: same meaning, new wording (paraphrase, don't copy). Keep it natural.
3. REORDER (shuffle) some scenes into a new sequence — but only where the overall meaning still holds together. Some scenes must stay put if moving them breaks sense (e.g. an intro or conclusion).
4. Use ESSENTIALLY ALL the content, so the recreation is about the same length as the original.

Return ONLY valid JSON, no markdown, of this exact shape:
{"scenes":[{"title":"short label","newText":"the reworded text","startIndex":0,"endIndex":4}]}
- The ARRAY ORDER is the NEW order of scenes (already shuffled).
- startIndex/endIndex are inclusive cue numbers from the transcript; each scene is a contiguous [startIndex..endIndex] run.
- Cover the whole transcript across the scenes; scenes should not overlap.`;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!project.source_video_id) return NextResponse.json({ error: "This project has no source video." }, { status: 400 });

  const video = await getVideo(project.source_video_id);
  if (!video) return NextResponse.json({ error: "Source video not found." }, { status: 404 });
  if (video.transcript_status !== "done" || !video.transcript_json) {
    return NextResponse.json({ error: "Source video isn't transcribed yet. Wait for it to finish." }, { status: 409 });
  }

  let segs: Seg[];
  try {
    segs = JSON.parse(video.transcript_json) as Seg[];
  } catch {
    return NextResponse.json({ error: "Transcript is corrupted." }, { status: 500 });
  }
  if (!Array.isArray(segs) || segs.length === 0) {
    return NextResponse.json({ error: "Transcript is empty." }, { status: 400 });
  }

  const fmt = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
  const numbered = segs.map((s, i) => `#${i} [${fmt(s.start)}] ${s.text}`).join("\n");

  const body = await req.json().catch(() => ({}));
  const instructions: string = typeof body?.instructions === "string" ? body.instructions.trim() : "";

  const userPrompt =
    `VIDEO: ${video.title} (${Math.round(video.duration)}s, ${segs.length} cues)\n` +
    (instructions ? `EXTRA STYLE INSTRUCTIONS: ${instructions}\n` : "") +
    `\nTRANSCRIPT (numbered cues):\n${numbered}\n\n` +
    `Return the recreated scenes as JSON now.`;

  // LLM call with a hard timeout.
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
        temperature: 0.6,
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
  const content: string = llmData.choices?.[0]?.message?.content ?? "";
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return NextResponse.json({ error: "AI did not return valid JSON" }, { status: 502 });

  let parsed: { scenes?: unknown };
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return NextResponse.json({ error: "Failed to parse AI JSON" }, { status: 502 });
  }

  const rawScenes = Array.isArray(parsed.scenes) ? parsed.scenes : [];
  const n = segs.length;
  const segments: TimelineSegment[] = [];

  for (const raw of rawScenes as Array<{ title?: string; newText?: string; startIndex?: number; endIndex?: number }>) {
    let a = Math.round(Number(raw.startIndex));
    let b = Math.round(Number(raw.endIndex));
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    a = Math.max(0, Math.min(a, n - 1));
    b = Math.max(0, Math.min(b, n - 1));
    if (b < a) [a, b] = [b, a];
    const trimStart = segs[a].start;
    const trimEnd = segs[b].end;
    if (!(trimEnd > trimStart)) continue;
    segments.push({
      videoId: video.id,
      youtubeUrl: video.youtube_url,
      trimStart,
      trimEnd,
      sceneTitle: (raw.title ?? "").toString().slice(0, 120),
      newText: (raw.newText ?? "").toString(),
      originalText: segs.slice(a, b + 1).map((s) => s.text).join(" "),
    });
  }

  if (segments.length === 0) {
    return NextResponse.json({ error: "AI produced no usable scenes. Try again." }, { status: 422 });
  }

  const timeline: Timeline = { fps: 30, width: 1080, height: 1920, segments };
  await updateProject(id, { timeline_json: JSON.stringify(timeline), status: "planned", error: null });
  return NextResponse.json({ timeline });
}
