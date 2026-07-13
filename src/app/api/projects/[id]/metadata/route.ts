// POST /api/projects/[id]/metadata — AI writes SEO title/description/tags for publishing.
import { NextRequest, NextResponse } from "next/server";
import { getProject, updateProject } from "@/lib/db";
import type { Timeline } from "@/lib/types";

const BASE_URL = process.env.PLANNER_BASE_URL ?? "https://ollama.com/v1";
const API_KEY = process.env.OLLAMA_API_KEY ?? process.env.PLANNER_API_KEY ?? "";
const MODEL = process.env.PLANNER_MODEL ?? "glm-5.2";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let script = project.name;
  try {
    const tl = JSON.parse(project.timeline_json ?? "{}") as Timeline;
    const lines = (tl.segments ?? []).map((s) => s.newText || s.originalText || "").filter(Boolean);
    if (lines.length) script = lines.join(" ");
  } catch {}

  const system = `You are a YouTube SEO expert. For the video whose narration is given, write:
- a clickable, high-CTR title (max 70 chars, no quotes)
- a description (2-3 sentences that hook + summarize, then a new line with 3-5 relevant hashtags)
- 10-12 lowercase tags (short keywords/phrases).
Return ONLY JSON: {"title":"...","description":"...","tags":["...","..."]}`;
  const user = `VIDEO TITLE (working): ${project.name}\n\nNARRATION:\n${script.slice(0, 3000)}`;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 90_000);
  let resp: Response;
  try {
    resp = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) },
      body: JSON.stringify({ model: MODEL, messages: [{ role: "system", content: system }, { role: "user", content: user }], temperature: 0.6 }),
      signal: ac.signal,
    });
  } catch (e) {
    return NextResponse.json({ error: `Request failed: ${(e as Error).message}` }, { status: 502 });
  } finally { clearTimeout(timer); }
  if (!resp.ok) return NextResponse.json({ error: `LLM error: ${resp.status}` }, { status: 502 });

  const data = await resp.json();
  const content: string = data.choices?.[0]?.message?.content ?? "";
  const m = content.match(/\{[\s\S]*\}/);
  let parsed: { title?: string; description?: string; tags?: unknown };
  try { parsed = JSON.parse(m?.[0] ?? "{}"); } catch { return NextResponse.json({ error: "Bad metadata JSON" }, { status: 502 }); }

  const existing = (() => { try { return JSON.parse(project.publish_json ?? "{}"); } catch { return {}; } })();
  const publish = {
    ...existing,
    title: (parsed.title ?? project.name).toString().slice(0, 100),
    description: (parsed.description ?? "").toString().slice(0, 4500),
    tags: Array.isArray(parsed.tags) ? parsed.tags.map((t) => String(t).slice(0, 40)).slice(0, 15) : [],
    status: existing.status && existing.status !== "none" ? existing.status : "ready",
  };
  await updateProject(id, { publish_json: JSON.stringify(publish) });
  return NextResponse.json({ publish });
}
