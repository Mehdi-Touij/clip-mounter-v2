"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  Play, Pause, Scissors, Trash2, ZoomIn, ZoomOut, SkipBack, X, Loader2,
  Film, Type, Music, Mic, Download, Clapperboard,
} from "lucide-react";

export interface EditorSegment {
  videoId: string;
  trimStart: number;
  trimEnd: number | null;
  sceneTitle?: string;
  newText?: string;
  originalText?: string;
  youtubeUrl?: string;
}

interface Props {
  projectName: string;
  sourceVideoId: string;
  sourceDuration: number;
  segments: EditorSegment[];
  exporting: boolean;
  onExport: (segments: EditorSegment[]) => void;
  onClose: () => void;
}

const MIN_CLIP = 0.4;
const fmt = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
const dur = (s: EditorSegment) => Math.max(0, (s.trimEnd ?? 0) - s.trimStart);

type Panel = "scenes" | "text" | "music" | "voice" | "export";
type Drag =
  | { kind: "trimL" | "trimR"; index: number; startX: number; origStart: number; origEnd: number }
  | { kind: "move"; index: number }
  | null;

const RAIL: { key: Panel; label: string; icon: typeof Film; soon?: boolean }[] = [
  { key: "scenes", label: "Scenes", icon: Film },
  { key: "text", label: "Text", icon: Type, soon: true },
  { key: "music", label: "Music", icon: Music, soon: true },
  { key: "voice", label: "Voice", icon: Mic, soon: true },
  { key: "export", label: "Export", icon: Download },
];

export function Studio({ projectName, sourceVideoId, sourceDuration, segments, exporting, onExport, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [segs, setSegs] = useState<EditorSegment[]>(segments);
  const [selected, setSelected] = useState(0);
  const [panel, setPanel] = useState<Panel>("scenes");
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [pxPerSec, setPxPerSec] = useState(12);

  // Multi-source preview: the <video> src follows the active segment's source clip.
  const initialVid = segments[0]?.videoId ?? sourceVideoId;
  const [activeVideoId, setActiveVideoIdState] = useState(initialVid);
  const activeVideoIdRef = useRef(initialVid);
  const setActive = (id: string) => { activeVideoIdRef.current = id; setActiveVideoIdState(id); };

  const dragRef = useRef<Drag>(null);
  const curIndex = useRef(0);
  const pendingSeek = useRef<number | null>(null);
  const pendingPlay = useRef(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const cum = useMemo(() => { const a: number[] = []; let t = 0; for (const s of segs) { a.push(t); t += dur(s); } return a; }, [segs]);
  const total = useMemo(() => segs.reduce((a, s) => a + dur(s), 0), [segs]);

  const mapOut = useCallback((out: number): { index: number; src: number } => {
    const c = Math.max(0, Math.min(out, total));
    for (let i = 0; i < segs.length; i++) {
      if (c <= cum[i] + dur(segs[i]) || i === segs.length - 1) return { index: i, src: segs[i].trimStart + (c - cum[i]) };
    }
    return { index: 0, src: segs[0]?.trimStart ?? 0 };
  }, [segs, cum, total]);

  const stopRaf = () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = null; };
  const pause = useCallback(() => { videoRef.current?.pause(); setPlaying(false); stopRaf(); }, []);

  const tick = useCallback(() => {
    const v = videoRef.current; if (!v) return;
    const seg = segs[curIndex.current]; if (!seg) { pause(); return; }
    // Wait for a pending source switch to finish loading before reading time.
    if ((seg.videoId ?? activeVideoIdRef.current) !== activeVideoIdRef.current) { rafRef.current = requestAnimationFrame(tick); return; }
    if (pendingSeek.current !== null) {
      if (Math.abs(v.currentTime - pendingSeek.current) < 0.3) pendingSeek.current = null;
      else { rafRef.current = requestAnimationFrame(tick); return; }
    }
    const st = v.currentTime; const end = seg.trimEnd ?? sourceDuration;
    if (st >= end - 0.04) {
      const ni = curIndex.current + 1;
      if (ni >= segs.length) { pause(); setPlayhead(total); return; }
      curIndex.current = ni;
      const target = segs[ni].trimStart;
      if (segs[ni].videoId !== activeVideoIdRef.current) {
        // next scene is a different source clip → swap src; resumes via onCanPlay
        pendingSeek.current = target; pendingPlay.current = true; setActive(segs[ni].videoId);
        return;
      }
      v.currentTime = target; pendingSeek.current = target;
      rafRef.current = requestAnimationFrame(tick); return;
    }
    setPlayhead(cum[curIndex.current] + Math.max(0, st - seg.trimStart));
    rafRef.current = requestAnimationFrame(tick);
  }, [segs, cum, total, sourceDuration, pause]);

  const startPlayback = useCallback(() => {
    const v = videoRef.current; if (!v) return;
    v.play().then(() => { setPlaying(true); stopRaf(); rafRef.current = requestAnimationFrame(tick); }).catch(() => {});
  }, [tick]);

  // Point the preview at segment `index` at `srcTime`, switching source clip if needed.
  const goTo = useCallback((index: number, srcTime: number, autoplay: boolean) => {
    const v = videoRef.current; if (!v || !segs[index]) return;
    curIndex.current = index;
    const vid = segs[index].videoId;
    if (vid && vid !== activeVideoIdRef.current) {
      pendingSeek.current = srcTime; pendingPlay.current = autoplay; setActive(vid);
    } else {
      v.currentTime = srcTime; pendingSeek.current = srcTime;
      if (autoplay) { if (v.readyState >= 2) startPlayback(); else v.addEventListener("canplay", startPlayback, { once: true }); }
    }
  }, [segs, startPlayback]);

  const play = useCallback(() => {
    if (segs.length === 0) return;
    const { index, src } = mapOut(playhead >= total ? 0 : playhead);
    goTo(index, src, true);
  }, [segs, playhead, total, mapOut, goTo]);

  const scrub = useCallback((out: number) => {
    const { index, src } = mapOut(out);
    goTo(index, src, playing);
    setPlayhead(Math.max(0, Math.min(out, total)));
  }, [mapOut, total, goTo, playing]);

  // Fires after a source-clip src change loads → apply the queued seek / play.
  const onCanPlay = useCallback(() => {
    setReady(true);
    const v = videoRef.current; if (!v) return;
    if (pendingSeek.current !== null) v.currentTime = pendingSeek.current;
    if (pendingPlay.current) { pendingPlay.current = false; startPlayback(); }
  }, [startPlayback]);

  const onMeta = useCallback(() => {
    const v = videoRef.current; if (!v) return;
    setReady(v.readyState >= 2);
    if (!playing && !pendingPlay.current) {
      const { index, src } = mapOut(playhead);
      if (segs[index]?.videoId === activeVideoIdRef.current) { curIndex.current = index; v.currentTime = src; pendingSeek.current = src; }
    }
  }, [mapOut, playhead, playing, segs]);

  useEffect(() => () => stopRaf(), []);

  const split = () => {
    const { index, src } = mapOut(playhead); const seg = segs[index]; if (!seg) return;
    const end = seg.trimEnd ?? sourceDuration;
    if (src <= seg.trimStart + MIN_CLIP || src >= end - MIN_CLIP) return;
    const a = { ...seg, trimEnd: src };
    const b = { ...seg, trimStart: src, trimEnd: end, sceneTitle: seg.sceneTitle ? `${seg.sceneTitle} (2)` : undefined };
    setSegs([...segs.slice(0, index), a, b, ...segs.slice(index + 1)]); setSelected(index);
  };
  const removeSel = () => { if (segs.length <= 1) return; setSegs(segs.filter((_, i) => i !== selected)); setSelected((s) => Math.max(0, Math.min(s, segs.length - 2))); };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current; const track = trackRef.current; if (!d || !track) return;
      if (d.kind === "trimL" || d.kind === "trimR") {
        const delta = (e.clientX - d.startX) / pxPerSec;
        setSegs((prev) => {
          const next = [...prev]; const s = { ...next[d.index] }; const end = s.trimEnd ?? sourceDuration;
          if (d.kind === "trimL") s.trimStart = Math.max(0, Math.min(d.origStart + delta, end - MIN_CLIP));
          else s.trimEnd = Math.min(sourceDuration, Math.max(d.origEnd + delta, s.trimStart + MIN_CLIP));
          next[d.index] = s; return next;
        });
      } else if (d.kind === "move") {
        const rect = track.getBoundingClientRect(); const x = e.clientX - rect.left + track.scrollLeft; const cursor = x / pxPerSec;
        setSegs((prev) => {
          let acc = 0, target = prev.length - 1;
          for (let i = 0; i < prev.length; i++) { const w = dur(prev[i]); if (cursor < acc + w / 2) { target = i; break; } acc += w; }
          if (target === d.index) return prev;
          const next = [...prev]; const [m] = next.splice(d.index, 1); next.splice(target, 0, m); d.index = target; setSelected(target); return next;
        });
      }
    };
    const onUp = () => { dragRef.current = null; document.body.style.userSelect = ""; };
    window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp);
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
  }, [pxPerSec, sourceDuration]);

  const startTrim = (e: React.PointerEvent, index: number, side: "L" | "R") => {
    e.stopPropagation(); const s = segs[index];
    dragRef.current = { kind: side === "L" ? "trimL" : "trimR", index, startX: e.clientX, origStart: s.trimStart, origEnd: s.trimEnd ?? sourceDuration };
    document.body.style.userSelect = "none";
  };
  const startMove = (e: React.PointerEvent, index: number) => { setSelected(index); dragRef.current = { kind: "move", index }; document.body.style.userSelect = "none"; };

  const onTrackClick = (e: React.MouseEvent) => {
    if (dragRef.current) return; const track = trackRef.current; if (!track) return;
    const rect = track.getBoundingClientRect(); const x = e.clientX - rect.left + track.scrollLeft; scrub(x / pxPerSec); if (playing) pause();
  };

  const width = Math.max(total * pxPerSec, 240);
  const ticks = useMemo(() => {
    const step = pxPerSec >= 36 ? 5 : pxPerSec >= 14 ? 15 : 30; const out: number[] = [];
    for (let t = 0; t <= total + step; t += step) out.push(t); return out;
  }, [pxPerSec, total]);
  const sel = segs[selected];

  const Lane = ({ label, icon: Icon, tone, children }: { label: string; icon: typeof Film; tone: string; children?: React.ReactNode }) => (
    <div className="flex items-stretch border-t border-white/5">
      <div className="flex w-28 shrink-0 items-center gap-1.5 bg-zinc-900/60 px-2 py-1.5 text-[11px] font-medium text-zinc-400">
        <Icon className={`h-3.5 w-3.5 ${tone}`} /> {label}
      </div>
      <div className="relative flex-1">{children}</div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950 text-zinc-100">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground"><Clapperboard className="h-4 w-4" /></span>
          <div>
            <p className="text-sm font-semibold leading-none">Studio</p>
            <p className="mt-0.5 text-[11px] text-zinc-400">{projectName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => onExport(segs)} disabled={exporting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60">
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Export video
          </button>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
      </div>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        {/* Module rail */}
        <div className="flex w-[76px] shrink-0 flex-col items-center gap-1 border-r border-white/10 py-3">
          {RAIL.map((m) => {
            const Icon = m.icon; const active = panel === m.key;
            return (
              <button key={m.key} onClick={() => setPanel(m.key)}
                className={`flex w-[62px] flex-col items-center gap-1 rounded-lg py-2 text-[10px] font-medium transition-colors ${active ? "bg-primary/15 text-primary" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"}`}>
                <Icon className="h-5 w-5" /> {m.label}
              </button>
            );
          })}
        </div>

        {/* Content panel */}
        <div className="w-72 shrink-0 overflow-y-auto border-r border-white/10 p-3">
          {panel === "scenes" && (
            <>
              <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">Scenes</p>
              <div className="space-y-1.5">
                {segs.map((s, i) => (
                  <button key={i} onClick={() => { setSelected(i); scrub(cum[i]); }}
                    className={`w-full rounded-lg border p-2 text-left transition-colors ${i === selected ? "border-primary/60 bg-primary/10" : "border-white/10 bg-white/5 hover:border-white/20"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium">{i + 1}. {s.sceneTitle || `Scene ${i + 1}`}</span>
                      <span className="shrink-0 text-[10px] tabular-nums text-zinc-500">{dur(s).toFixed(1)}s</span>
                    </div>
                    {s.newText && <p className="mt-1 line-clamp-2 text-[11px] text-zinc-400">{s.newText}</p>}
                  </button>
                ))}
              </div>
            </>
          )}
          {panel === "export" && (
            <>
              <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">Export</p>
              <div className="space-y-2 text-sm text-zinc-300">
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <p className="text-xs text-zinc-400">Format</p>
                  <p className="font-medium">Vertical · 1080 × 1920 · MP4</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <p className="text-xs text-zinc-400">Length</p>
                  <p className="font-medium tabular-nums">{fmt(total)} · {segs.length} scenes</p>
                </div>
                <button onClick={() => onExport(segs)} disabled={exporting}
                  className="mt-1 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60">
                  {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Export video
                </button>
              </div>
            </>
          )}
          {(panel === "text" || panel === "music" || panel === "voice") && (
            <div className="rounded-lg border border-dashed border-white/15 p-4 text-center">
              <p className="text-sm font-medium capitalize">{panel}</p>
              <p className="mt-1 text-xs text-zinc-400">
                {panel === "text" && "On-screen captions from your reworded script."}
                {panel === "music" && "Background music track."}
                {panel === "voice" && "AI voiceover generated from the new script."}
              </p>
              <span className="mt-2 inline-block rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-zinc-300">Coming soon</span>
            </div>
          )}
        </div>

        {/* Preview */}
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 bg-zinc-900/40 p-6">
          <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black" style={{ aspectRatio: "9 / 16", height: "min(62vh, 560px)" }}>
            <video ref={videoRef} src={`/api/videos/${activeVideoId}/file`} className="h-full w-full object-contain"
              playsInline preload="auto" onLoadedMetadata={onMeta} onCanPlay={onCanPlay} onEnded={() => pause()} />
            {!ready && <div className="absolute inset-0 grid place-items-center bg-black/50"><span className="flex items-center gap-2 text-xs text-white/80"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</span></div>}
            {sel?.sceneTitle && <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 text-center text-sm font-medium">{sel.sceneTitle}</div>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => scrub(0)} className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-zinc-300 hover:bg-white/10"><SkipBack className="h-4 w-4" /></button>
            <button onClick={() => (playing ? pause() : play())} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-4 py-2 text-sm font-medium hover:bg-white/15">
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />} {playing ? "Pause" : "Play"}
            </button>
            <span className="ml-1 text-xs tabular-nums text-zinc-400">{fmt(playhead)} / {fmt(total)}</span>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="border-t border-white/10 bg-zinc-900/50">
        <div className="flex items-center gap-2 px-3 py-1.5">
          <button onClick={split} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-300 hover:bg-white/10"><Scissors className="h-3.5 w-3.5" /> Split</button>
          <button onClick={removeSel} disabled={segs.length <= 1} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-300 hover:bg-white/10 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
          <div className="mx-1 h-4 w-px bg-white/10" />
          <button onClick={() => setPxPerSec((p) => Math.max(4, p / 1.4))} className="grid h-6 w-6 place-items-center rounded-md text-zinc-300 hover:bg-white/10"><ZoomOut className="h-3.5 w-3.5" /></button>
          <button onClick={() => setPxPerSec((p) => Math.min(160, p * 1.4))} className="grid h-6 w-6 place-items-center rounded-md text-zinc-300 hover:bg-white/10"><ZoomIn className="h-3.5 w-3.5" /></button>
          <span className="ml-auto text-[11px] text-zinc-500">drag edges to trim · drag clips to reorder</span>
        </div>

        <div ref={trackRef} className="relative max-h-[38vh] overflow-x-auto overflow-y-hidden" onClick={onTrackClick}>
          <div className="relative" style={{ width: width + 112 }}>
            {/* Ruler */}
            <div className="flex">
              <div className="w-28 shrink-0" />
              <div className="relative h-5 flex-1">
                {ticks.map((t) => (
                  <div key={t} className="absolute top-0 h-full border-l border-white/10" style={{ left: t * pxPerSec }}>
                    <span className="ml-1 text-[10px] tabular-nums text-zinc-500">{fmt(t)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Video lane (interactive) */}
            <Lane label="Video" icon={Film} tone="text-primary">
              <div className="relative h-14">
                {segs.map((s, i) => {
                  const left = cum[i] * pxPerSec; const w = Math.max(dur(s) * pxPerSec, 6); const isSel = i === selected;
                  return (
                    <div key={i} onPointerDown={(e) => startMove(e, i)} onClick={(e) => { e.stopPropagation(); setSelected(i); }}
                      className={`absolute top-1 flex h-12 cursor-grab items-center overflow-hidden rounded-md border text-[11px] active:cursor-grabbing ${isSel ? "border-primary ring-2 ring-primary/50 bg-primary/25" : "border-primary/50 bg-primary/15"}`}
                      style={{ left, width: w }}>
                      <div onPointerDown={(e) => startTrim(e, i, "L")} className="absolute left-0 top-0 h-full w-2 cursor-ew-resize bg-primary/80 hover:bg-primary" />
                      <span className="pointer-events-none truncate px-3 font-medium text-white">{s.sceneTitle || `Scene ${i + 1}`}</span>
                      <div onPointerDown={(e) => startTrim(e, i, "R")} className="absolute right-0 top-0 h-full w-2 cursor-ew-resize bg-primary/80 hover:bg-primary" />
                    </div>
                  );
                })}
              </div>
            </Lane>

            {/* Placeholder lanes — light up in later phases */}
            <Lane label="Text" icon={Type} tone="text-sky-400"><div className="h-8" /></Lane>
            <Lane label="Music" icon={Music} tone="text-emerald-400"><div className="h-8" /></Lane>
            <Lane label="Voice" icon={Mic} tone="text-amber-400"><div className="h-8" /></Lane>

            {/* Playhead */}
            <div className="pointer-events-none absolute top-0 bottom-0 z-20 w-px bg-red-500" style={{ left: 112 + playhead * pxPerSec }}>
              <div className="absolute -left-1.5 -top-0 h-3 w-3 rounded-full bg-red-500" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
