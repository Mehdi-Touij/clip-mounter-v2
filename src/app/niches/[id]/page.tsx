"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Video, Rss, Trash2, Plus, Target, Search, Eye, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/status-pill";

interface Niche { id: string; name: string; description: string; format: string; videos_per_day: number }
interface Channel { id: string; url: string; handle: string; title: string; subscribers: number; video_count: number; status: string }
interface Source { id: string; type: string; url: string; title: string }
interface NVideo { id: string; title: string; channel: string; duration: number; transcript_status: string; download_status: string }
interface Scene { videoId: string; videoTitle: string; channel: string; start: number; end: number; text: string; score?: number }
interface TopVideo { id: string; youtube_id: string; title: string; channel: string; views: number; duration: number; indexed: number; estRevenue: number }
interface Spy { metrics: { channels: number; videos: number; avgViews: number; estRpm: number }; top: TopVideo[] }

const fmt = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
const abbr = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : `${n}`;

function vStatus(v: NVideo): { label: string; tone: "green" | "blue" | "amber" | "red" | "muted"; pulse?: boolean } {
  if (v.transcript_status === "error" || v.download_status === "error") return { label: "Failed", tone: "red" };
  if (v.download_status === "downloaded" && v.transcript_status === "done") return { label: "Indexed", tone: "green" };
  if (v.download_status === "downloading") return { label: "Downloading", tone: "blue", pulse: true };
  if (v.transcript_status === "fetching") return { label: "Transcribing", tone: "amber", pulse: true };
  return { label: "Queued", tone: "muted", pulse: true };
}

export default function NicheDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [niche, setNiche] = useState<Niche | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [videos, setVideos] = useState<NVideo[]>([]);
  const [spy, setSpy] = useState<Spy | null>(null);
  const [channelUrl, setChannelUrl] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [sceneQ, setSceneQ] = useState("");
  const [scenes, setScenes] = useState<Scene[] | null>(null);
  const [searching, setSearching] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchNiche = useCallback(async () => {
    const r = await fetch(`/api/niches/${id}`); const d = await r.json();
    setNiche(d.niche ?? null); setChannels(d.channels ?? []); setSources(d.sources ?? []);
  }, [id]);
  const fetchVideos = useCallback(async () => {
    const r = await fetch(`/api/niches/${id}/videos`); const d = await r.json(); setVideos(d.videos ?? []);
  }, [id]);
  const fetchSpy = useCallback(async () => {
    const r = await fetch(`/api/niches/${id}/spy`); const d = await r.json(); setSpy(d.metrics ? d : null);
  }, [id]);

  useEffect(() => { fetchNiche(); fetchVideos(); fetchSpy(); }, [fetchNiche, fetchVideos, fetchSpy]);

  useEffect(() => {
    const processing = videos.some((v) => { const t = vStatus(v).tone; return t !== "green" && t !== "red"; });
    if (processing && !pollRef.current) pollRef.current = setInterval(fetchVideos, 4000);
    if (!processing && pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [videos, fetchVideos]);

  const addChannel = async () => { if (!channelUrl.trim()) return; setBusy(true); try { const r = await fetch(`/api/niches/${id}/channels`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: channelUrl }) }); const d = await r.json(); if (d.channels) { setChannels(d.channels); setChannelUrl(""); } } finally { setBusy(false); } };
  const removeChannel = async (cid: string) => { setChannels((p) => p.filter((c) => c.id !== cid)); await fetch(`/api/niches/${id}/channels/${cid}`, { method: "DELETE" }); };
  const addSource = async () => { if (!sourceUrl.trim()) return; setBusy(true); try { const r = await fetch(`/api/niches/${id}/sources`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: sourceUrl }) }); const d = await r.json(); if (d.sources) { setSources(d.sources); setSourceUrl(""); } } finally { setBusy(false); } };
  const removeSource = async (sid: string) => { setSources((p) => p.filter((s) => s.id !== sid)); await fetch(`/api/niches/${id}/sources/${sid}`, { method: "DELETE" }); };
  const addVideo = async () => { if (!videoUrl.trim()) return; setBusy(true); try { const r = await fetch(`/api/niches/${id}/videos`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: videoUrl }) }); const d = await r.json(); if (d.errors?.length) alert(d.errors.join("\n")); setVideoUrl(""); fetchVideos(); } finally { setBusy(false); } };
  const search = async () => { setSearching(true); try { const r = await fetch(`/api/niches/${id}/scenes?q=${encodeURIComponent(sceneQ)}`); const d = await r.json(); setScenes(d.scenes ?? []); } finally { setSearching(false); } };

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await fetch(`/api/niches/${id}/sync`, { method: "POST" });
      const d = await r.json();
      if (d.error) alert(d.error); else if (d.errors?.length) alert(d.errors.join("\n"));
      await fetchNiche(); await fetchSpy();
    } finally { setSyncing(false); }
  };
  const indexTop = async (cvid: string) => {
    await fetch(`/api/niches/${id}/channel-videos/${cvid}/index`, { method: "POST" });
    setSpy((p) => p ? { ...p, top: p.top.map((t) => t.id === cvid ? { ...t, indexed: 1 } : t) } : p);
    fetchVideos();
  };

  if (!niche) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  const indexed = videos.filter((v) => v.transcript_status === "done" && v.download_status === "downloaded").length;

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 md:px-10">
      <Link href="/niches" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"><ArrowLeft className="h-4 w-4" /> All niches</Link>

      <div className="mb-6 flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Target className="h-5 w-5" /></span>
        <div className="min-w-0"><h1 className="text-2xl font-semibold tracking-tight">{niche.name}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{niche.format === "long" ? "Long-form" : "Shorts"} · {niche.videos_per_day} videos/day{niche.description ? ` · ${niche.description}` : ""}</p></div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2"><Video className="h-4 w-4 text-red-500" /><p className="text-sm font-semibold">Competitor channels</p>
            <Button size="sm" variant="outline" className="ml-auto h-7 px-2 text-xs" onClick={sync} disabled={syncing || channels.length === 0}>{syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Sync</Button>
          </div>
          <div className="mb-3 flex gap-2">
            <input className="h-9 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40" placeholder="@channel or URL" value={channelUrl} onChange={(e) => setChannelUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addChannel()} />
            <Button size="sm" onClick={addChannel} disabled={busy || !channelUrl.trim()}><Plus className="h-4 w-4" /></Button>
          </div>
          {channels.length === 0 ? <p className="py-4 text-center text-xs text-muted-foreground">Add competitors, then Sync to pull their videos.</p> : (
            <div className="space-y-1">{channels.map((c) => (
              <div key={c.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent"><Video className="h-3.5 w-3.5 shrink-0 text-red-500" /><span className="min-w-0 flex-1 truncate text-sm">{c.title || c.handle}</span>{c.subscribers > 0 && <span className="text-xs text-muted-foreground">{abbr(c.subscribers)} subs</span>}<StatusPill tone={c.status === "synced" ? "green" : c.status === "error" ? "red" : c.status === "syncing" ? "blue" : "muted"} pulse={c.status === "syncing"}>{c.status}</StatusPill><button onClick={() => removeChannel(c.id)} className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button></div>
            ))}</div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2"><Rss className="h-4 w-4 text-amber-500" /><p className="text-sm font-semibold">News sources</p><span className="ml-auto text-xs text-muted-foreground">{sources.length}</span></div>
          <div className="mb-3 flex gap-2"><input className="h-9 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40" placeholder="RSS feed URL" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addSource()} /><Button size="sm" onClick={addSource} disabled={busy || !sourceUrl.trim()}><Plus className="h-4 w-4" /></Button></div>
          {sources.length === 0 ? <p className="py-4 text-center text-xs text-muted-foreground">Add RSS feeds that post niche news.</p> : (
            <div className="space-y-1">{sources.map((s) => (<div key={s.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent"><Rss className="h-3.5 w-3.5 shrink-0 text-amber-500" /><span className="min-w-0 flex-1 truncate text-sm">{s.title}</span><button onClick={() => removeSource(s.id)} className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button></div>))}</div>
          )}
        </div>
      </div>

      {/* Competitor intelligence (spy) */}
      {spy && spy.metrics.videos > 0 && (
        <div className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2"><Eye className="h-4 w-4 text-primary" /><p className="text-sm font-semibold">Competitor intelligence</p></div>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Channels</p><p className="text-xl font-semibold">{spy.metrics.channels}</p></div>
            <div className="rounded-xl bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Videos</p><p className="text-xl font-semibold">{spy.metrics.videos}</p></div>
            <div className="rounded-xl bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Avg views</p><p className="text-xl font-semibold">{abbr(spy.metrics.avgViews)}</p></div>
            <div className="rounded-xl bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Est. RPM</p><p className="text-xl font-semibold">${spy.metrics.estRpm.toFixed(2)}</p></div>
          </div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Top performers</p>
          <div className="space-y-1">{spy.top.map((t) => (
            <div key={t.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-accent">
              <div className="min-w-0 flex-1"><p className="truncate text-sm">{t.title}</p><p className="text-xs text-muted-foreground">{t.channel} · {fmt(t.duration)}</p></div>
              <div className="shrink-0 text-right"><p className="text-sm tabular-nums">{abbr(t.views)}</p><p className="text-[11px] text-muted-foreground">~${t.estRevenue.toLocaleString()} est.</p></div>
              {t.indexed ? <StatusPill tone="green">indexed</StatusPill> : <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => indexTop(t.id)}>Index</Button>}
            </div>
          ))}</div>
          <p className="mt-2 text-[11px] text-muted-foreground">Views are public; revenue is an estimate (views × RPM). &ldquo;Index&rdquo; pulls a video into the scene library.</p>
        </div>
      )}

      {/* Competitor videos (indexing status) */}
      <div className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2"><Video className="h-4 w-4 text-primary" /><p className="text-sm font-semibold">Scene library</p><span className="ml-auto text-xs text-muted-foreground">{indexed}/{videos.length} videos indexed</span></div>
        <div className="mb-3 flex gap-2"><input className="h-9 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40" placeholder="Or paste a competitor video URL directly…" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addVideo()} /><Button size="sm" onClick={addVideo} disabled={busy || !videoUrl.trim()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add</Button></div>
        {videos.length === 0 ? <p className="py-3 text-center text-xs text-muted-foreground">Index videos from the spy above, or paste a URL.</p> : (
          <div className="space-y-1">{videos.map((v) => { const st = vStatus(v); return (<div key={v.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5"><Video className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate text-sm">{v.title}</span>{v.duration > 0 && <span className="text-xs tabular-nums text-muted-foreground">{fmt(v.duration)}</span>}<StatusPill tone={st.tone} pulse={st.pulse}>{st.label}</StatusPill></div>); })}</div>
        )}
      </div>

      {/* Scene search */}
      <div className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2"><Search className="h-4 w-4 text-primary" /><p className="text-sm font-semibold">Scene search</p><span className="ml-auto text-xs text-muted-foreground">semantic · {indexed} videos</span></div>
        <div className="mb-3 flex gap-2"><input className="h-9 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40" placeholder="Describe a moment — e.g. the power shift from Charles to William" value={sceneQ} onChange={(e) => setSceneQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} /><Button size="sm" onClick={search} disabled={searching}>{searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Search</Button></div>
        {scenes === null ? <p className="py-3 text-center text-xs text-muted-foreground">Finds the exact moments by meaning across every indexed video.</p>
          : scenes.length === 0 ? <p className="py-3 text-center text-xs text-muted-foreground">No matching scenes{indexed === 0 ? " — index some videos first." : "."}</p>
          : <div className="space-y-1.5">{scenes.map((s, i) => (<div key={i} className="rounded-lg border border-border p-2.5"><p className="text-sm">{s.text}</p><p className="mt-1 text-xs text-muted-foreground"><span className="rounded bg-muted px-1.5 py-0.5 tabular-nums">{fmt(s.start)}–{fmt(s.end)}</span> · {s.videoTitle}{typeof s.score === "number" ? ` · ${(s.score * 100).toFixed(0)}% match` : ""}</p></div>))}</div>}
      </div>
    </div>
  );
}
