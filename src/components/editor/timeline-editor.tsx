"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Play, Pause, Scissors, Trash2, ZoomIn, ZoomOut, SkipBack, Music, Video as VideoIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  sourceVideoId: string;
  sourceDuration: number;
  segments: EditorSegment[];
  onChange: (segments: EditorSegment[]) => void;
}

const MIN_CLIP = 0.4; // seconds
const fmt = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
const dur = (s: EditorSegment) => Math.max(0, (s.trimEnd ?? 0) - s.trimStart);

type Drag =
  | { kind: "trimL" | "trimR"; index: number; startX: number; origStart: number; origEnd: number }
  | { kind: "move"; index: number }
  | null;

export function TimelineEditor({ sourceVideoId, sourceDuration, segments, onChange }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [segs, setSegs] = useState<EditorSegment[]>(segments);
  const [selected, setSelected] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [playhead, setPlayhead] = useState(0); // output-timeline seconds
  const [pxPerSec, setPxPerSec] = useState(14);

  const dragRef = useRef<Drag>(null);
  const curIndex = useRef(0);
  const pendingSeek = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  // Keep parent in sync.
  useEffect(() => { onChange(segs); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [segs]);

  // Output timeline math.
  const cum = useMemo(() => {
    const arr: number[] = [];
    let t = 0;
    for (const s of segs) { arr.push(t); t += dur(s); }
    return arr;
  }, [segs]);
  const total = useMemo(() => segs.reduce((a, s) => a + dur(s), 0), [segs]);

  const mapOut = useCallback((out: number): { index: number; src: number } => {
    const clamped = Math.max(0, Math.min(out, total));
    for (let i = 0; i < segs.length; i++) {
      if (clamped <= cum[i] + dur(segs[i]) || i === segs.length - 1) {
        return { index: i, src: segs[i].trimStart + (clamped - cum[i]) };
      }
    }
    return { index: 0, src: segs[0]?.trimStart ?? 0 };
  }, [segs, cum, total]);

  const stopRaf = () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = null; };

  const pause = useCallback(() => {
    videoRef.current?.pause();
    setPlaying(false);
    stopRaf();
  }, []);

  const tick = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const seg = segs[curIndex.current];
    if (!seg) { pause(); return; }

    if (pendingSeek.current !== null) {
      if (Math.abs(v.currentTime - pendingSeek.current) < 0.3) pendingSeek.current = null;
      else { rafRef.current = requestAnimationFrame(tick); return; }
    }

    const st = v.currentTime;
    const end = seg.trimEnd ?? sourceDuration;
    if (st >= end - 0.04) {
      const ni = curIndex.current + 1;
      if (ni >= segs.length) { pause(); setPlayhead(total); return; }
      curIndex.current = ni;
      const target = segs[ni].trimStart;
      v.currentTime = target;
      pendingSeek.current = target;
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    setPlayhead(cum[curIndex.current] + Math.max(0, st - seg.trimStart));
    rafRef.current = requestAnimationFrame(tick);
  }, [segs, cum, total, sourceDuration, pause]);

  const play = useCallback(() => {
    const v = videoRef.current;
    if (!v || segs.length === 0) return;
    const { index, src } = mapOut(playhead >= total ? 0 : playhead);
    curIndex.current = index;
    v.currentTime = src;
    pendingSeek.current = src;
    const start = () => v.play().then(() => {
      setPlaying(true);
      stopRaf();
      rafRef.current = requestAnimationFrame(tick);
    }).catch(() => {});
    if (v.readyState >= 2) start();
    else v.addEventListener("canplay", start, { once: true });
  }, [segs, playhead, total, mapOut, tick]);

  // Once the source is ready, show the first clip's frame instead of a black poster.
  const onMeta = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    setReady(v.readyState >= 2);
    if (!playing) {
      const { index, src } = mapOut(playhead);
      curIndex.current = index;
      v.currentTime = src;
      pendingSeek.current = src;
    }
  }, [mapOut, playhead, playing]);

  const scrub = useCallback((out: number) => {
    const v = videoRef.current;
    const { index, src } = mapOut(out);
    curIndex.current = index;
    if (v) { v.currentTime = src; pendingSeek.current = src; }
    setPlayhead(Math.max(0, Math.min(out, total)));
  }, [mapOut, total]);

  useEffect(() => () => stopRaf(), []);

  // ---- editing ops ----
  const update = (next: EditorSegment[]) => setSegs(next);

  const split = () => {
    const { index, src } = mapOut(playhead);
    const seg = segs[index];
    if (!seg) return;
    const end = seg.trimEnd ?? sourceDuration;
    if (src <= seg.trimStart + MIN_CLIP || src >= end - MIN_CLIP) return;
    const a = { ...seg, trimEnd: src };
    const b = { ...seg, trimStart: src, trimEnd: end, sceneTitle: seg.sceneTitle ? `${seg.sceneTitle} (2)` : undefined };
    update([...segs.slice(0, index), a, b, ...segs.slice(index + 1)]);
    setSelected(index);
  };

  const removeSel = () => {
    if (segs.length <= 1) return;
    update(segs.filter((_, i) => i !== selected));
    setSelected((s) => Math.max(0, Math.min(s, segs.length - 2)));
  };

  // ---- pointer drag (trim + reorder) ----
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      const track = trackRef.current;
      if (!d || !track) return;

      if (d.kind === "trimL" || d.kind === "trimR") {
        const deltaSec = (e.clientX - d.startX) / pxPerSec;
        setSegs((prev) => {
          const next = [...prev];
          const s = { ...next[d.index] };
          const end = s.trimEnd ?? sourceDuration;
          if (d.kind === "trimL") s.trimStart = Math.max(0, Math.min(d.origStart + deltaSec, end - MIN_CLIP));
          else s.trimEnd = Math.min(sourceDuration, Math.max((d.origEnd) + deltaSec, s.trimStart + MIN_CLIP));
          next[d.index] = s;
          return next;
        });
      } else if (d.kind === "move") {
        const rect = track.getBoundingClientRect();
        const x = e.clientX - rect.left + track.scrollLeft;
        const outAtCursor = x / pxPerSec;
        // find target index by cumulative midpoints
        setSegs((prev) => {
          let acc = 0, target = prev.length - 1;
          for (let i = 0; i < prev.length; i++) {
            const w = dur(prev[i]);
            if (outAtCursor < acc + w / 2) { target = i; break; }
            acc += w;
          }
          if (target === d.index) return prev;
          const next = [...prev];
          const [moved] = next.splice(d.index, 1);
          next.splice(target, 0, moved);
          d.index = target;
          setSelected(target);
          return next;
        });
      }
    };
    const onUp = () => { dragRef.current = null; document.body.style.userSelect = ""; };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
  }, [pxPerSec, sourceDuration]);

  const startTrim = (e: React.PointerEvent, index: number, side: "L" | "R") => {
    e.stopPropagation();
    const s = segs[index];
    dragRef.current = { kind: side === "L" ? "trimL" : "trimR", index, startX: e.clientX, origStart: s.trimStart, origEnd: s.trimEnd ?? sourceDuration };
    document.body.style.userSelect = "none";
  };
  const startMove = (e: React.PointerEvent, index: number) => {
    setSelected(index);
    dragRef.current = { kind: "move", index };
    document.body.style.userSelect = "none";
  };

  const onTrackClick = (e: React.MouseEvent) => {
    if (dragRef.current) return;
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const x = e.clientX - rect.left + track.scrollLeft;
    scrub(x / pxPerSec);
    if (playing) pause();
  };

  const width = Math.max(total * pxPerSec, 200);
  const ticks = useMemo(() => {
    const step = pxPerSec >= 40 ? 5 : pxPerSec >= 16 ? 15 : 30;
    const out: number[] = [];
    for (let t = 0; t <= total + step; t += step) out.push(t);
    return { step, out };
  }, [pxPerSec, total]);

  const sel = segs[selected];

  return (
    <div className="space-y-4">
      {/* Preview + inspector */}
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <div className="flex flex-col items-center gap-3">
          <div className="relative w-[220px] overflow-hidden rounded-xl border border-border bg-black" style={{ aspectRatio: "9 / 16" }}>
            <video
              ref={videoRef}
              src={`/api/videos/${sourceVideoId}/file`}
              className="h-full w-full object-contain"
              playsInline
              preload="auto"
              onLoadedMetadata={onMeta}
              onCanPlay={() => setReady(true)}
              onEnded={() => pause()}
            />
            {!ready && (
              <div className="absolute inset-0 grid place-items-center bg-black/50 text-white/80">
                <span className="flex items-center gap-2 text-xs"><Loader2 className="h-4 w-4 animate-spin" /> Loading source…</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => scrub(0)} title="To start"><SkipBack className="h-4 w-4" /></Button>
            <Button size="sm" onClick={() => (playing ? pause() : play())}>
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {playing ? "Pause" : "Play"}
            </Button>
          </div>
          <p className="text-xs tabular-nums text-muted-foreground">{fmt(playhead)} / {fmt(total)}</p>
        </div>

        {/* Selected clip inspector */}
        <div className="rounded-xl border border-border bg-card p-4">
          {sel ? (
            <>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">{sel.sceneTitle || `Scene ${selected + 1}`}</p>
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
                  {fmt(sel.trimStart)} – {fmt(sel.trimEnd ?? sourceDuration)} · {dur(sel).toFixed(1)}s
                </span>
              </div>
              {sel.newText && <p className="text-sm leading-relaxed">{sel.newText}</p>}
              {sel.originalText && <p className="mt-1.5 line-clamp-2 text-xs italic text-muted-foreground/80">was: {sel.originalText}</p>}
            </>
          ) : <p className="text-sm text-muted-foreground">Select a clip on the timeline.</p>}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-2">
        <Button size="sm" variant="outline" onClick={split}><Scissors className="h-4 w-4" /> Split</Button>
        <Button size="sm" variant="outline" onClick={removeSel} disabled={segs.length <= 1}><Trash2 className="h-4 w-4" /> Delete</Button>
        <div className="mx-1 h-5 w-px bg-border" />
        <Button size="sm" variant="ghost" onClick={() => setPxPerSec((p) => Math.max(4, p / 1.4))}><ZoomOut className="h-4 w-4" /></Button>
        <Button size="sm" variant="ghost" onClick={() => setPxPerSec((p) => Math.min(160, p * 1.4))}><ZoomIn className="h-4 w-4" /></Button>
        <span className="ml-auto text-xs text-muted-foreground">{segs.length} clips · drag edges to trim · drag clips to reorder</span>
      </div>

      {/* Timeline */}
      <div ref={trackRef} className="relative overflow-x-auto rounded-xl border border-border bg-muted/30 pb-2" onClick={onTrackClick}>
        <div className="relative" style={{ width }}>
          {/* Ruler */}
          <div className="relative h-6 border-b border-border">
            {ticks.out.map((t) => (
              <div key={t} className="absolute top-0 h-full border-l border-border/60" style={{ left: t * pxPerSec }}>
                <span className="ml-1 text-[10px] tabular-nums text-muted-foreground">{fmt(t)}</span>
              </div>
            ))}
          </div>

          {/* Video track */}
          <div className="relative mt-2 h-16 px-0">
            <div className="pointer-events-none absolute -left-0 top-1/2 z-10 -translate-y-1/2 pl-1">
              <VideoIcon className="h-3.5 w-3.5 text-muted-foreground/50" />
            </div>
            {segs.map((s, i) => {
              const left = cum[i] * pxPerSec;
              const w = Math.max(dur(s) * pxPerSec, 6);
              const isSel = i === selected;
              return (
                <div
                  key={i}
                  onPointerDown={(e) => startMove(e, i)}
                  onClick={(e) => { e.stopPropagation(); setSelected(i); }}
                  className={`absolute top-1 flex h-14 cursor-grab items-center overflow-hidden rounded-md border text-[11px] active:cursor-grabbing ${isSel ? "border-primary ring-2 ring-primary/40 bg-primary/15" : "border-primary/40 bg-primary/10"}`}
                  style={{ left, width: w }}
                >
                  <div onPointerDown={(e) => startTrim(e, i, "L")} className="absolute left-0 top-0 h-full w-2 cursor-ew-resize bg-primary/70 hover:bg-primary" />
                  <span className="pointer-events-none truncate px-3 font-medium text-foreground/90">{s.sceneTitle || `Scene ${i + 1}`}</span>
                  <div onPointerDown={(e) => startTrim(e, i, "R")} className="absolute right-0 top-0 h-full w-2 cursor-ew-resize bg-primary/70 hover:bg-primary" />
                </div>
              );
            })}
          </div>

          {/* Audio lane (reserved for the future TTS/voice track) */}
          <div className="relative mt-2 h-9">
            <div className="pointer-events-none absolute left-1 top-1/2 z-10 -translate-y-1/2">
              <Music className="h-3.5 w-3.5 text-muted-foreground/50" />
            </div>
            {segs.map((s, i) => (
              <div
                key={i}
                className="absolute top-1 flex h-7 items-center overflow-hidden rounded border border-emerald-500/30 bg-emerald-500/10"
                style={{ left: cum[i] * pxPerSec, width: Math.max(dur(s) * pxPerSec, 6) }}
              >
                <span className="pointer-events-none truncate px-2 text-[10px] text-emerald-600 dark:text-emerald-400">audio</span>
              </div>
            ))}
          </div>

          {/* Playhead */}
          <div className="pointer-events-none absolute top-0 bottom-0 z-20 w-px bg-red-500" style={{ left: playhead * pxPerSec }}>
            <div className="absolute -left-1.5 -top-0.5 h-3 w-3 rounded-full bg-red-500" />
          </div>
        </div>
      </div>
    </div>
  );
}
