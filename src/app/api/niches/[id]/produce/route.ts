// POST /api/niches/[id]/produce — the AI producer: rank today's video ideas from the
// niche's latest news + what's performing for competitors.
import { NextRequest, NextResponse } from "next/server";
import { getNiche, listNews, listChannelVideos, replaceIdeas, listIdeas } from "@/lib/db";

const BASE_URL = process.env.PLANNER_BASE_URL ?? "https://ollama.com/v1";
const API_KEY = process.env.OLLAMA_API_KEY ?? process.env.PLANNER_API_KEY ?? "";
const MODEL = process.env.PLANNER_MODEL ?? "glm-5.2";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const niche = await getNiche(id);
  if (!niche) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const news = await listNews(id, 20);
  const competitors = await listChannelVideos(id, 15);
  if (news.length === 0 && competitors.length === 0) {
    return NextResponse.json({ error: "Refresh news or sync competitors first — the producer needs signal." }, { status: 400 });
  }

  const n = Math.max(1, Math.min(8, niche.videos_per_day || 4));
  const newsBlock = news.map((x) => `- ${x.title} (${x.source})${x.summary ? ` — ${x.summary.slice(0, 140)}` : ""}`).join("\n") || "(none)";
  const compBlock = competitors.map((c) => `- ${c.title} — ${c.views.toLocaleString()} views`).join("\n") || "(none)";

  const system = `You are a YouTube content strategist for a faceless ${niche.format === "long" ? "long-form" : "Shorts"} channel in the niche "${niche.name}"${niche.description ? ` (${niche.description})` : ""}.
Suggest the ${n} best videos to make TODAY, ranked #1 = highest opportunity. Base them on the latest news and on what is currently performing for competitors.
Each idea needs: a punchy, clickable title; the angle (how to frame it); and a one-line rationale tying it to a specific news item and/or competitor performance.
Return ONLY valid JSON, no markdown: {"ideas":[{"title":"...","angle":"...","rationale":"..."}]} in ranked order (best first).`;

  const user = `NICHE: ${niche.name}\n\nLATEST NEWS:\n${newsBlock}\n\nCOMPETITOR TOP PERFORMERS (title — views):\n${compBlock}\n\nSuggest ${n} videos to make today, ranked.`;

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
    return NextResponse.json({ error: `Producer request failed: ${(e as Error).message}` }, { status: 502 });
  } finally { clearTimeout(timer); }

  if (!resp.ok) return NextResponse.json({ error: `LLM error: ${resp.status}` }, { status: 502 });
  const data = await resp.json();
  const content: string = data.choices?.[0]?.message?.content ?? "";
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return NextResponse.json({ error: "Producer did not return valid JSON" }, { status: 502 });

  let parsed: { ideas?: Array<{ title?: string; angle?: string; rationale?: string }> };
  try { parsed = JSON.parse(match[0]); } catch { return NextResponse.json({ error: "Failed to parse producer JSON" }, { status: 502 }); }

  const ideas = (parsed.ideas ?? []).slice(0, n).map((x, i) => ({
    title: (x.title ?? "").toString().slice(0, 200),
    angle: (x.angle ?? "").toString().slice(0, 400),
    rationale: (x.rationale ?? "").toString().slice(0, 400),
    priority: i + 1,
  })).filter((x) => x.title);

  if (ideas.length === 0) return NextResponse.json({ error: "Producer returned no ideas. Try again." }, { status: 422 });

  await replaceIdeas(id, ideas);
  return NextResponse.json({ ideas: await listIdeas(id) });
}
