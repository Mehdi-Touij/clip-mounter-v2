"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Video, Rss, Trash2, Plus, Target, Search, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/status-pill";

interface Niche { id: string; name: string; description: string; format: string; videos_per_day: number }
interface Channel { id: string; url: string; handle: string; title: string; status: string }
interface Source { id: string; type: string; url: string; title: string }
interface NVideo { id: string; title: string; channel: string; duration: number; transcript_status: string; download_status: string }
interface Scene { videoId: string; videoTitle: string; channel: string; start: number; end: number; text: string }

const fmt = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;

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
  const [channelUrl, setChannelUrl] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [sceneQ, setSceneQ] = useState("");
  const [scenes, setScenes] = useState<Scene[] | null>(null);
  const [searching, setSearching] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchNiche = useCallback(async () => {
    const res = await fetch(`/api/niches/${id}`);
    const data = await res.json();
    setNiche(data.niche ?? null); setChannels(data.channels ?? []); setSources(data.sources ?? []);
  }, [id]);

  const fetchVideos = useCallback(async () => {
    const res = await fetch(`/api/niches/${id}/videos`);
    const data = await res.json();
    setVideos(data.videos ?? []);
  }, [id]);

  useEffect(() => { fetchNiche(); fetchVideos(); }, [fetchNiche, fetchVideos]);

  // Poll while any video is still processing.
  useEffect(() => {
    const processing = videos.some((v) => vStatus(v).tone !== "green" && vStatus(v).tone !== "red");
    if (processing && !pollRef.current) pollRef.current = setInterval(fetchVideos, 4000);
    if (!processing && pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [videos, fetchVideos]);

  const addChannel = async () => {
    if (!channelUrl.trim()) return; setBusy(true);
    try { const r = await fetch(`/api/niches/${id}/channels`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: channelUrl }) }); const d = await r.json(); if (d.channels) { setChannels(d.channels); setChannelUrl(""); } } finally { setBusy(false); }
  };
  const removeChannel = async (cid: string) => { setChannels((p) => p.filter((c) => c.id !== cid)); await fetch(`/api/niches/${id}/channels/${cid}`, { method: "DELETE" }); };
  const addSource = async () => {
    if (!sourceUrl.trim()) return; setBusy(true);
    try { const r = await fetch(`/api/niches/${id}/sources`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: sourceUrl }) }); const d = await r.json(); if (d.sources) { setSources(d.sources); setSourceUrl(""); } } finally { setBusy(false); }
  };
  const removeSource = async (sid: string) => { setSources((p) => p.filter((s) => s.id !== sid)); await fetch(`/api/niches/${id}/sources/${sid}`, { method: "DELETE" }); };
  const addVideo = async () => {
    if (!videoUrl.trim()) return; setBusy(true);
    try { const r = await fetch(`/api/niches/${id}/videos`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: videoUrl }) }); const d = await r.json(); if (d.errors?.length) alert(d.errors.join("\n")); setVideoUrl(""); fetchVideos(); } finally { setBusy(false); }
  };
  const search = async () => {
    setSearching(true);
    try { const r = await fetch(`/api/niches/${id}/scenes?q=${encodeURIComponent(sceneQ)}`); const d = await r.json(); setScenes(d.scenes ?? []); } finally { setSearching(false); }
  };

  if (!niche) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const indexed = videos.filter((v) => v.transcript_status === "done" && v.download_status === "downloaded").length;

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
            {niche.format === "long" ? "Long-form" : "Shorts"} · {niche.videos_per_day} videos/day{niche.description ? ` · ${niche.description}` : ""}
          </p>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2"><Video className="h-4 w-4 text-red-500" /><p className="text-sm font-semibold">Competitor channels</p><span className="ml-auto text-xs text-muted-foreground">{channels.length}</span></div>
          <div className="mb-3 flex gap-2">
            <input className="h-9 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40" placeholder="@channel or URL" value={channelUrl} onChange={(e) => setChannelUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addChannel()} />
            <Button size="sm" onClick={addChannel} disabled={busy || !channelUrl.trim()}><Plus className="h-4 w-4" /></Button>
          </div>
          {channels.length === 0 ? <p className="py-4 text-center text-xs text-muted-foreground">Add competitors in the same niche.</p> : (
            <div className="space-y-1">{channels.map((c) => (
              <div key={c.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent"><Video className="h-3.5 w-3.5 shrink-0 text-red-500" /><span className="min-w-0 flex-1 truncate text-sm">{c.title || c.handle}</span><StatusPill tone="muted">added</StatusPill><button onClick={() => removeChannel(c.id)} className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button></div>
            ))}</div>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">Auto-pulling each channel&apos;s videos needs a YouTube API key (next).</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2"><Rss className="h-4 w-4 text-amber-500" /><p className="text-sm font-semibold">News sources</p><span className="ml-auto text-xs text-muted-foreground">{sources.length}</span></div>
          <div className="mb-3 flex gap-2">
            <input className="h-9 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40" placeholder="RSS feed URL" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addSource()} />
            <Button size="sm" onClick={addSource} disabled={busy || !sourceUrl.trim()}><Plus className="h-4 w-4" /></Button>
          </div>
          {sources.length === 0 ? <p className="py-4 text-center text-xs text-muted-foreground">Add RSS feeds that post niche news.</p> : (
            <div className="space-y-1">{sources.map((s) => (
              <div key={s.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent"><Rss className="h-3.5 w-3.5 shrink-0 text-amber-500" /><span className="min-w-0 flex-1 truncate text-sm">{s.title}</span><button onClick={() => removeSource(s.id)} className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button></div>
            ))}</div>
          )}
        </div>
      </div>

      {/* Competitor videos → scene index */}
      <div className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2"><Video className="h-4 w-4 text-primary" /><p className="text-sm font-semibold">Competitor videos</p><span className="ml-auto text-xs text-muted-foreground">{indexed}/{videos.length} indexed</span></div>
        <div className="mb-3 flex gap-2">
          <input className="h-9 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40" placeholder="Paste a competitor video URL to index its scenes…" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addVideo()} />
          <Button size="sm" onClick={addVideo} disabled={busy || !videoUrl.trim()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add</Button>
        </div>
        {videos.length === 0 ? <p className="py-3 text-center text-xs text-muted-foreground">Add competitor videos — each is transcribed and every scene indexed.</p> : (
          <div className="space-y-1">{videos.map((v) => { const st = vStatus(v); return (
            <div key={v.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5"><Video className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate text-sm">{v.title}</span>{v.duration > 0 && <span className="text-xs tabular-nums text-muted-foreground">{fmt(v.duration)}</span>}<StatusPill tone={st.tone} pulse={st.pulse}>{st.label}</StatusPill></div>
          ); })}</div>
        )}
      </div>

      {/* Scene index search */}
      <div className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2"><Search className="h-4 w-4 text-primary" /><p className="text-sm font-semibold">Scene index</p><span className="ml-auto text-xs text-muted-foreground">search {indexed} indexed videos</span></div>
        <div className="mb-3 flex gap-2">
          <input className="h-9 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40" placeholder="e.g. Charlotte official duties" value={sceneQ} onChange={(e) => setSceneQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} />
          <Button size="sm" onClick={search} disabled={searching}>{searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Search</Button>
        </div>
        {scenes === null ? (
          <p className="py-3 text-center text-xs text-muted-foreground">Search finds the exact moments across every indexed video.</p>
        ) : scenes.length === 0 ? (
          <p className="py-3 text-center text-xs text-muted-foreground">No matching scenes{indexed === 0 ? " — index some videos first." : "."}</p>
        ) : (
          <div className="space-y-1.5">{scenes.map((s, i) => (
            <div key={i} className="rounded-lg border border-border p-2.5">
              <p className="text-sm">{s.text}</p>
              <p className="mt-1 text-xs text-muted-foreground"><span className="rounded bg-muted px-1.5 py-0.5 tabular-nums">{fmt(s.start)}–{fmt(s.end)}</span> · {s.videoTitle}</p>
            </div>
          ))}</div>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">Keyword match now · meaning-based (semantic) + visual search are the next sub-phases.</p>
      </div>

      <div className="mt-6 rounded-2xl border border-dashed border-border p-5">
        <div className="flex items-center gap-2"><Eye className="h-4 w-4 text-primary" /><p className="text-sm font-semibold">Coming next</p><StatusPill tone="violet" className="ml-auto">roadmap</StatusPill></div>
        <p className="mt-1.5 text-sm text-muted-foreground">Auto-pull channel videos + stats (YouTube API), semantic + visual scene search, then the AI producer that suggests daily videos.</p>
      </div>
    </div>
  );
}
