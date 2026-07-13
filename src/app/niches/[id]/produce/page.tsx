"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Sparkles, Rss, RotateCcw, ExternalLink, Clapperboard, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

interface News { id: string; title: string; link: string; source: string; published_at: string; summary: string }
interface Idea { id: string; title: string; angle: string; rationale: string; priority: number; status: string; project_id: string }

export default function ProducePage() {
  const { id } = useParams<{ id: string }>();
  const [name, setName] = useState("");
  const [news, setNews] = useState<News[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [producing, setProducing] = useState(false);
  const [assembling, setAssembling] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [n, nw, id2] = await Promise.all([
      fetch(`/api/niches/${id}`).then((r) => r.json()),
      fetch(`/api/niches/${id}/news`).then((r) => r.json()),
      fetch(`/api/niches/${id}/ideas`).then((r) => r.json()),
    ]);
    setName(n.niche?.name ?? "");
    setNews(nw.news ?? []);
    setIdeas(id2.ideas ?? []);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const refreshNews = async () => {
    setRefreshing(true);
    try {
      const r = await fetch(`/api/niches/${id}/news/refresh`, { method: "POST" });
      const d = await r.json();
      if (d.error) alert(d.error); else setNews(d.news ?? []);
    } finally { setRefreshing(false); }
  };

  const produce = async () => {
    setProducing(true);
    try {
      const r = await fetch(`/api/niches/${id}/produce`, { method: "POST" });
      const d = await r.json();
      if (d.ideas) setIdeas(d.ideas); else alert(d.error ?? "Producer failed.");
    } finally { setProducing(false); }
  };

  const assemble = async (ideaId: string) => {
    setAssembling(ideaId);
    try {
      const r = await fetch(`/api/niches/${id}/ideas/${ideaId}/assemble`, { method: "POST" });
      const d = await r.json();
      if (d.projectId) window.location.href = `/projects/${d.projectId}`;
      else alert(d.error ?? "Assembly failed.");
    } finally { setAssembling(null); }
  };

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 md:px-10">
      <Link href={`/niches/${id}`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {name || "Niche"}
      </Link>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Today&apos;s plan</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">The AI producer ranks the videos to make, from the latest news + what&apos;s working for competitors.</p>
        </div>
        <Button onClick={produce} disabled={producing}>
          {producing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {producing ? "Thinking…" : "Suggest today's videos"}
        </Button>
      </div>

      {/* Suggested videos */}
      <div className="mb-6 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <p className="mb-3 text-sm font-semibold">Suggested videos</p>
        {ideas.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No suggestions yet — click &ldquo;Suggest today&apos;s videos&rdquo;.</p>
        ) : (
          <div className="space-y-2.5">
            {ideas.map((idea) => (
              <div key={idea.id} className="flex gap-3 rounded-xl border border-border p-3.5">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-sm font-bold tabular-nums text-primary">{idea.priority}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium leading-snug">{idea.title}</p>
                  {idea.angle && <p className="mt-1 text-sm text-muted-foreground">{idea.angle}</p>}
                  {idea.rationale && <p className="mt-1 text-xs text-primary/90"><Sparkles className="mr-1 inline h-3 w-3" />{idea.rationale}</p>}
                </div>
                <div className="shrink-0 self-center">
                  {idea.status === "assembled" && idea.project_id ? (
                    <Link href={`/projects/${idea.project_id}`}><Button size="sm" variant="outline"><Play className="h-4 w-4" /> Open video</Button></Link>
                  ) : (
                    <Button size="sm" onClick={() => assemble(idea.id)} disabled={assembling !== null}>
                      {assembling === idea.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clapperboard className="h-4 w-4" />}
                      {assembling === idea.id ? "Building…" : "Assemble"}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {ideas.length > 0 && <p className="mt-3 text-[11px] text-muted-foreground">Assembling an idea into a finished video (script → matched scenes → voiceover → render) is the next phase.</p>}
      </div>

      {/* Latest news */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <Rss className="h-4 w-4 text-amber-500" />
          <p className="text-sm font-semibold">Latest news</p>
          <Button size="sm" variant="outline" className="ml-auto h-7 px-2 text-xs" onClick={refreshNews} disabled={refreshing}>
            {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Refresh
          </Button>
        </div>
        {news.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No news yet — add RSS sources on the niche page, then Refresh.</p>
        ) : (
          <div className="space-y-1">
            {news.slice(0, 20).map((n) => (
              <a key={n.id} href={n.link} target="_blank" rel="noreferrer" className="group flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-accent">
                <Rss className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{n.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{n.source}</p>
                </div>
                <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
