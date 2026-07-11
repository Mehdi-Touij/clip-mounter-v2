"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2, Sparkles, Play, Download, Save, RotateCcw, ArrowUp, ArrowDown, Trash2, Film } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusPill } from "@/components/status-pill";

interface Segment {
  videoId: string;
  trimStart: number;
  trimEnd: number | null;
  sceneTitle?: string;
  newText?: string;
  originalText?: string;
}

interface Timeline {
  fps: number;
  width: number;
  height: number;
  segments: Segment[];
}

interface Project {
  id: string;
  name: string;
  source_video_id: string;
  status: string;
  timeline_json: string | null;
  output_path: string | null;
  error: string | null;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function statusPill(status: string) {
  switch (status) {
    case "done": return <StatusPill tone="green">Done</StatusPill>;
    case "rendering": return <StatusPill tone="blue" pulse>Rendering</StatusPill>;
    case "planned": return <StatusPill tone="violet">Ready to render</StatusPill>;
    case "error": return <StatusPill tone="red">Error</StatusPill>;
    default: return <StatusPill tone="muted">Draft</StatusPill>;
  }
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [sourceTitle, setSourceTitle] = useState<string>("");
  const [instructions, setInstructions] = useState("");
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [editedSegments, setEditedSegments] = useState<Segment[]>([]);
  const [recreating, setRecreating] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showEditor, setShowEditor] = useState(false);

  const fetchProject = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${id}`);
      const data = await res.json();
      setProject(data.project);
      if (data.project?.timeline_json) {
        const tl = JSON.parse(data.project.timeline_json) as Timeline;
        setTimeline(tl);
        setEditedSegments(tl.segments);
      }
      if (data.project?.source_video_id) {
        const vr = await fetch(`/api/videos/${data.project.source_video_id}`);
        const vd = await vr.json();
        if (vd.video) setSourceTitle(vd.video.title);
      }
    } catch {}
  }, [id]);

  useEffect(() => { fetchProject(); }, [fetchProject]);

  useEffect(() => {
    if (project && project.status === "rendering") {
      const interval = setInterval(fetchProject, 4000);
      return () => clearInterval(interval);
    }
  }, [project?.status, fetchProject]);

  const recreate = async () => {
    setRecreating(true);
    try {
      const res = await fetch(`/api/projects/${id}/recreate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instructions }),
      });
      const data = await res.json();
      if (data.timeline) {
        setTimeline(data.timeline);
        setEditedSegments(data.timeline.segments);
      } else {
        alert(data.error ?? "Recreation failed.");
      }
      fetchProject();
    } catch { alert("Recreation failed."); }
    finally { setRecreating(false); }
  };

  const enqueueRender = async (): Promise<boolean> => {
    const res = await fetch(`/api/projects/${id}/render`, { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "Could not start render.");
      return false;
    }
    return true;
  };

  const render = async () => {
    setRendering(true);
    await enqueueRender();
    fetchProject();
    setRendering(false);
  };

  const saveTimelineAndRender = async () => {
    setSaving(true);
    if (timeline) {
      const updated = { ...timeline, segments: editedSegments };
      await fetch(`/api/projects/${id}/timeline`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeline: updated }),
      });
    }
    const ok = await enqueueRender();
    if (ok) setShowEditor(false);
    fetchProject();
    setSaving(false);
  };

  if (!project) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isBusy = project.status === "rendering";
  const isPlanned = project.status === "planned" || project.status === "rendering" || project.status === "done";
  const isDone = project.status === "done" && project.output_path;
  const segmentsChanged = timeline && JSON.stringify(timeline.segments) !== JSON.stringify(editedSegments);
  const totalLen = (segs: Segment[]) => segs.reduce((a, s) => a + (s.trimEnd !== null ? s.trimEnd - s.trimStart : 0), 0);

  const moveUp = (i: number) => { if (i === 0) return; const n = [...editedSegments]; [n[i-1], n[i]] = [n[i], n[i-1]]; setEditedSegments(n); };
  const moveDown = (i: number) => { if (i === editedSegments.length - 1) return; const n = [...editedSegments]; [n[i+1], n[i]] = [n[i], n[i+1]]; setEditedSegments(n); };
  const remove = (i: number) => setEditedSegments(editedSegments.filter((_, idx) => idx !== i));

  const list = showEditor ? editedSegments : timeline?.segments ?? [];

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 md:px-10">
      <Link href="/projects" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All recreations
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
          {sourceTitle && (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Film className="h-3.5 w-3.5" /> Recreating <span className="font-medium text-foreground">{sourceTitle}</span>
            </p>
          )}
        </div>
        {statusPill(project.status)}
      </div>

      {project.error && (
        <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm">
          <p className="font-medium text-red-600 dark:text-red-400">Something went wrong</p>
          <p className="mt-1 text-muted-foreground">{project.error}</p>
        </div>
      )}

      {/* Recreate panel */}
      <div className="mb-6 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold">Recreate with AI</p>
            <p className="text-xs text-muted-foreground">Rewords the script (same meaning) and reshuffles scenes.</p>
          </div>
        </div>
        <Textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="Optional style notes (e.g. 'punchier tone', 'keep the intro first')…"
          rows={2}
          className="mb-3"
        />
        <div className="flex flex-wrap gap-2">
          <Button onClick={recreate} disabled={recreating || isBusy}>
            {recreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {recreating ? "Recreating…" : isPlanned ? "Recreate again" : "Recreate with AI"}
          </Button>
          {isPlanned && !showEditor && (
            <Button variant="outline" onClick={render} disabled={rendering || isBusy}>
              {rendering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {rendering ? "Rendering…" : "Render video"}
            </Button>
          )}
        </div>
      </div>

      {/* New script / editor */}
      {isPlanned && timeline && (
        <div className="mb-6 rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-border p-4">
            <div>
              <p className="font-semibold">{showEditor ? "Edit scene order" : "New script"}</p>
              <p className="text-xs text-muted-foreground">
                {list.length} scenes · ~{formatTime(totalLen(list))} total
              </p>
            </div>
            <div className="flex gap-2">
              {!showEditor ? (
                <Button variant="outline" size="sm" onClick={() => setShowEditor(true)}>
                  <RotateCcw className="h-4 w-4" /> Edit scenes
                </Button>
              ) : (
                <>
                  <Button variant="ghost" size="sm" onClick={() => { setEditedSegments(timeline.segments); setShowEditor(false); }}>Cancel</Button>
                  <Button size="sm" onClick={saveTimelineAndRender} disabled={saving || !segmentsChanged}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {saving ? "Saving…" : "Save & re-render"}
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="space-y-3 p-4">
            {showEditor
              ? editedSegments.map((seg, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-xl border border-border p-3">
                    <div className="flex flex-col items-center gap-0.5 pt-0.5">
                      <button onClick={() => moveUp(i)} disabled={i === 0} className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                      <span className="text-xs font-medium tabular-nums text-muted-foreground">{i + 1}</span>
                      <button onClick={() => moveDown(i)} disabled={i === editedSegments.length - 1} className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium">{seg.sceneTitle || `Scene ${i + 1}`}</p>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatTime(seg.trimStart)}{seg.trimEnd !== null ? ` – ${formatTime(seg.trimEnd)}` : " – end"}</span>
                      </div>
                      {seg.newText && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{seg.newText}</p>}
                    </div>
                    <button onClick={() => remove(i)} className="pt-0.5 text-muted-foreground transition-colors hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))
              : timeline.segments.map((seg, i) => (
                  <div key={i} className="rounded-xl border border-border p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">
                        <span className="mr-1.5 inline-grid h-5 w-5 place-items-center rounded-md bg-primary/10 text-[11px] font-bold tabular-nums text-primary">{i + 1}</span>
                        {seg.sceneTitle || `Scene ${i + 1}`}
                      </p>
                      <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
                        {formatTime(seg.trimStart)}{seg.trimEnd !== null ? ` – ${formatTime(seg.trimEnd)}` : " – end"}
                      </span>
                    </div>
                    {seg.newText && <p className="mt-2 text-sm leading-relaxed">{seg.newText}</p>}
                    {seg.originalText && <p className="mt-1.5 line-clamp-2 text-xs italic text-muted-foreground/80">was: {seg.originalText}</p>}
                  </div>
                ))}
          </div>
        </div>
      )}

      {/* Output */}
      {isDone && !showEditor && (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <p className="mb-3 font-semibold">Recreated video</p>
          <video src={`/api/projects/${id}/output`} controls className="mx-auto w-full max-w-[320px] rounded-xl border border-border" />
          <div className="mt-4 flex justify-center">
            <a href={`/api/projects/${id}/output`} download>
              <Button variant="outline"><Download className="h-4 w-4" /> Download MP4</Button>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
