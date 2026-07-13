// POST /api/niches/[id]/ideas/[ideaId]/assemble
// The capstone: idea → AI writes a script → each beat is matched to a scene from the
// semantic index → assembled into a timeline → a project is created and rendered.
import { NextRequest, NextResponse } from "next/server";
import {
  getNiche, getIdea, listNicheSceneRows, insertProject, updateProject,
  insertRenderJob, markIdeaAssembled,
} from "@/lib/db";
import { embed, cosine } from "@/lib/embeddings";
import type { Timeline, TimelineSegment } from "@/lib/types";

const BASE_URL = process.env.PLANNER_BASE_URL ?? "https://ollama.com/v1";
const API_KEY = process.env.OLLAMA_API_KEY ?? process.env.PLANNER_API_KEY ?? "";
const MODEL = process.env.PLANNER_MODEL ?? "glm-5.2";
const MAX_SCENE = 8; // seconds per beat

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; ideaId: string }> }) {
  const { id, ideaId } = await params;
  const niche = await getNiche(id);
  const idea = await getIdea(ideaId);
  if (!niche || !idea) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Only match against scenes whose source video is downloaded (renderable).
  const scenes = (await listNicheSceneRows(id)).filter((s) => s.download_status === "downloaded");
  if (scenes.length === 0) return NextResponse.json({ error: "No indexed+downloaded scenes yet. Index some competitor videos first." }, { status: 400 });

  const n = niche.format === "long" ? 12 : 6;

  // 1. Script.
  const system = `You write short, punchy voiceover scripts for a faceless ${niche.format === "long" ? "long-form" : "Shorts"} channel in the niche "${niche.name}". For the given video idea, write ${n} narration beats — each ONE short spoken sentence, in order, that together tell the story with a hook, build, and payoff. Return ONLY JSON: {"beats":["...","..."]}`;
  const user = `VIDEO: ${idea.title}\nANGLE: ${idea.angle}\nWrite ${n} beats.`;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 120_000);
  let resp: Response;
  try {
    resp = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) },
      body: JSON.stringify({ model: MODEL, messages: [{ role: "system", content: system }, { role: "user", content: user }], temperature: 0.7 }),
      signal: ac.signal,
    });
  } catch (e) {
    return NextResponse.json({ error: `Script request failed: ${(e as Error).message}` }, { status: 502 });
  } finally { clearTimeout(timer); }
  if (!resp.ok) return NextResponse.json({ error: `LLM error: ${resp.status}` }, { status: 502 });

  const data = await resp.json();
  const content: string = data.choices?.[0]?.message?.content ?? "";
  const match = content.match(/\{[\s\S]*\}/);
  let beats: string[] = [];
  try { beats = (JSON.parse(match?.[0] ?? "{}").beats ?? []).map((b: unknown) => String(b)).filter(Boolean); } catch {}
  if (beats.length === 0) return NextResponse.json({ error: "Could not write a script. Try again." }, { status: 422 });

  const allScenes = scenes.map((s) => { let e: number[] = []; try { e = JSON.parse(s.embedding); } catch {} return { ...s, vec: e }; });

  // 2. EVENT-LEVEL CURATION — pick the videos most relevant to this idea, then draw
  // scenes only from those, so every clip is on-topic by construction.
  const ideaVec = await embed(`${idea.title}. ${idea.angle}`);
  const byVideo = new Map<string, { rows: typeof allScenes; rel: number }>();
  for (const s of allScenes) {
    const rel = cosine(ideaVec, s.vec);
    const g = byVideo.get(s.video_id) ?? { rows: [], rel: -1 };
    g.rows.push(s); g.rel = Math.max(g.rel, rel);
    byVideo.set(s.video_id, g);
  }
  const rankedVideos = [...byVideo.values()].sort((a, b) => b.rel - a.rel);
  const TOP_VIDEOS = 4;
  const parsedScenes = rankedVideos.slice(0, TOP_VIDEOS).flatMap((v) => v.rows);

  // 3. Match each beat to the best unused scene within the curated pool (semantic).
  const used = new Set<string>();
  const segments: TimelineSegment[] = [];
  for (let i = 0; i < beats.length; i++) {
    const qv = await embed(beats[i]);
    let best: (typeof parsedScenes)[number] | null = null; let bestScore = -1;
    for (const s of parsedScenes) {
      if (used.has(s.id)) continue;
      const sc = cosine(qv, s.vec);
      if (sc > bestScore) { bestScore = sc; best = s; }
    }
    if (!best) continue;
    used.add(best.id);
    const trimEnd = Math.min(best.end, best.start + MAX_SCENE);
    if (trimEnd <= best.start) continue;
    segments.push({
      videoId: best.video_id, youtubeUrl: best.youtube_url,
      trimStart: best.start, trimEnd,
      sceneTitle: `Beat ${i + 1}`, newText: beats[i],
      originalText: best.visual_caption ? `${best.text} · [shows: ${best.visual_caption}]` : best.text,
    });
  }
  if (segments.length === 0) return NextResponse.json({ error: "No scenes matched the script. Index more videos." }, { status: 422 });

  // 5. Create project + timeline, auto-render.
  const projectId = await insertProject(idea.title.slice(0, 120), segments[0].videoId);
  const timeline: Timeline = { fps: 30, width: 1080, height: 1920, segments, voiceover: true };
  await updateProject(projectId, { timeline_json: JSON.stringify(timeline), status: "rendering", error: null });
  await insertRenderJob(projectId);
  await markIdeaAssembled(ideaId, projectId);

  return NextResponse.json({ projectId, scenes: segments.length });
}
