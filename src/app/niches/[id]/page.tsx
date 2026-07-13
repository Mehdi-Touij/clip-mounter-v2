"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Video, Rss, Trash2, Plus, Target, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/status-pill";

interface Niche { id: string; name: string; description: string; format: string; videos_per_day: number }
interface Channel { id: string; url: string; handle: string; title: string; subscribers: number; status: string }
interface Source { id: string; type: string; url: string; title: string }

export default function NicheDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [niche, setNiche] = useState<Niche | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [channelUrl, setChannelUrl] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const fetchNiche = useCallback(async () => {
    const res = await fetch(`/api/niches/${id}`);
    const data = await res.json();
    setNiche(data.niche ?? null);
    setChannels(data.channels ?? []);
    setSources(data.sources ?? []);
  }, [id]);

  useEffect(() => { fetchNiche(); }, [fetchNiche]);

  const addChannel = async () => {
    if (!channelUrl.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/niches/${id}/channels`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: channelUrl }),
      });
      const data = await res.json();
      if (data.channels) { setChannels(data.channels); setChannelUrl(""); }
      else alert(data.error ?? "Could not add channel");
    } finally { setBusy(false); }
  };
  const removeChannel = async (cid: string) => {
    setChannels((p) => p.filter((c) => c.id !== cid));
    await fetch(`/api/niches/${id}/channels/${cid}`, { method: "DELETE" });
  };
  const addSource = async () => {
    if (!sourceUrl.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/niches/${id}/sources`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: sourceUrl }),
      });
      const data = await res.json();
      if (data.sources) { setSources(data.sources); setSourceUrl(""); }
      else alert(data.error ?? "Could not add source");
    } finally { setBusy(false); }
  };
  const removeSource = async (sid: string) => {
    setSources((p) => p.filter((s) => s.id !== sid));
    await fetch(`/api/niches/${id}/sources/${sid}`, { method: "DELETE" });
  };

  if (!niche) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 md:px-10">
      <Link href="/niches" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All niches
      </Link>

      <div className="mb-6 flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Target className="h-5 w-5" /></span>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{niche.name}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {niche.format === "long" ? "Long-form" : "Shorts"} · {niche.videos_per_day} videos/day
            {niche.description ? ` · ${niche.description}` : ""}
          </p>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {/* Competitor channels */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Video className="h-4 w-4 text-red-500" />
            <p className="text-sm font-semibold">Competitor channels</p>
            <span className="ml-auto text-xs text-muted-foreground">{channels.length}</span>
          </div>
          <div className="mb-3 flex gap-2">
            <input className="h-9 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
              placeholder="@channel or URL" value={channelUrl} onChange={(e) => setChannelUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addChannel()} />
            <Button size="sm" onClick={addChannel} disabled={busy || !channelUrl.trim()}><Plus className="h-4 w-4" /></Button>
          </div>
          {channels.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">Add competitors working the same niche.</p>
          ) : (
            <div className="space-y-1">
              {channels.map((c) => (
                <div key={c.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent">
                  <Video className="h-3.5 w-3.5 shrink-0 text-red-500" />
                  <span className="min-w-0 flex-1 truncate text-sm">{c.title || c.handle}</span>
                  <StatusPill tone="muted">added</StatusPill>
                  <button onClick={() => removeChannel(c.id)} className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* News sources */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Rss className="h-4 w-4 text-amber-500" />
            <p className="text-sm font-semibold">News sources</p>
            <span className="ml-auto text-xs text-muted-foreground">{sources.length}</span>
          </div>
          <div className="mb-3 flex gap-2">
            <input className="h-9 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
              placeholder="RSS feed URL" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addSource()} />
            <Button size="sm" onClick={addSource} disabled={busy || !sourceUrl.trim()}><Plus className="h-4 w-4" /></Button>
          </div>
          {sources.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">Add RSS feeds that post niche news daily.</p>
          ) : (
            <div className="space-y-1">
              {sources.map((s) => (
                <div key={s.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent">
                  <Rss className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                  <span className="min-w-0 flex-1 truncate text-sm">{s.title}</span>
                  <button onClick={() => removeSource(s.id)} className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Next step (Phase 2 preview) */}
      <div className="mt-6 rounded-2xl border border-dashed border-border p-5">
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">Competitor intelligence</p>
          <StatusPill tone="violet" className="ml-auto">next phase</StatusPill>
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Once channels are added, the engine will pull each channel&apos;s videos + stats, transcribe them, index every scene, and
          suggest daily videos to make. That&apos;s the next build phase.
        </p>
      </div>
    </div>
  );
}
