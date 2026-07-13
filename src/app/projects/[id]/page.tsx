"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2, Sparkles, Play, Download, Film, FileText, Clapperboard } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusPill } from "@/components/status-pill";
import { TimelineEditor, type EditorSegment } from "@/components/editor/timeline-editor";

interface Timeline {
  fps: number;
  width: number;
  height: number;
  segments: EditorSegment[];
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
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceDuration, setSourceDuration] = useState(0);
  const [instructions, setInstructions] = useState("");
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [editedSegments, setEditedSegments] = useState<EditorSegment[]>([]);
  const [tab, setTab] = useState<"script" | "editor">("editor");
  const [recreating, setRecreating] = useState(false);
  const [rendering, setRendering] = useState(false);

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
        if (vd.video) { setSourceTitle(vd.video.title); setSourceDuration(vd.video.duration || 0); }
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
      if (data.timeline) { setTimeline(data.timeline); setEditedSegments(data.timeline.segments); }
      else alert(data.error ?? "Recreation failed.");
      fetchProject();
    } catch { alert("Recreation failed."); }
    finally { setRecreating(false); }
  };

  const exportVideo = async () => {
    setRendering(true);
    try {
      // Persist current edits, then render.
      if (timeline) {
        await fetch(`/api/projects/${id}/timeline`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ timeline: { ...timeline, segments: editedSegments } }),
        });
      }
      const res = await fetch(`/api/projects/${id}/render`, { method: "POST" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error ?? "Could not start export.");
      }
      fetchProject();
    } finally { setRendering(false); }
  };

  if (!project) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const isBusy = project.status === "rendering";
  const isPlanned = project.status === "planned" || project.status === "rendering" || project.status === "done";
  const isDone = project.status === "done" && project.output_path;
  const totalLen = editedSegments.reduce((a, s) => a + (s.trimEnd !== null ? (s.trimEnd ?? 0) - s.trimStart : 0), 0);
  const timelineKey = timeline ? `${timeline.segments.length}:${JSON.stringify(timeline.segments).length}` : "none";

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 md:px-10">
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
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary"><Sparkles className="h-4 w-4" /></span>
          <div>
            <p className="text-sm font-semibold">Recreate with AI</p>
            <p className="text-xs text-muted-foreground">Rewords the script (same meaning) and reshuffles scenes.</p>
          </div>
        </div>
        <Textarea value={instructions} onChange={(e) => setInstructions(e.target.value)}
          placeholder="Optional style notes (e.g. 'punchier tone', 'keep the intro first')…" rows={2} className="mb-3" />
        <Button onClick={recreate} disabled={recreating || isBusy}>
          {recreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {recreating ? "Recreating…" : isPlanned ? "Recreate again" : "Recreate with AI"}
        </Button>
      </div>

      {/* Workspace: Script / Editor tabs */}
      {isPlanned && timeline && (
        <div className="mb-6 rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-3">
            <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
              <button onClick={() => setTab("editor")}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${tab === "editor" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                <Clapperboard className="h-4 w-4" /> Editor
              </button>
              <button onClick={() => setTab("script")}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${tab === "script" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                <FileText className="h-4 w-4" /> Script
              </button>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">{editedSegments.length} scenes · ~{formatTime(totalLen)}</span>
              <Button size="sm" onClick={exportVideo} disabled={rendering || isBusy}>
                {rendering || isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {isBusy ? "Exporting…" : "Export video"}
              </Button>
            </div>
          </div>

          <div className="p-4">
            {tab === "editor" ? (
              sourceDuration > 0 ? (
                <TimelineEditor
                  key={timelineKey}
                  sourceVideoId={project.source_video_id}
                  sourceDuration={sourceDuration}
                  segments={timeline.segments}
                  onChange={setEditedSegments}
                />
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">Loading source video…</p>
              )
            ) : (
              <div className="space-y-3">
                {timeline.segments.map((seg, i) => (
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
            )}
          </div>
        </div>
      )}

      {/* Exported result */}
      {isDone && (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <p className="mb-3 font-semibold">Exported video</p>
          <video src={`/api/projects/${id}/output`} controls className="mx-auto w-full max-w-[300px] rounded-xl border border-border" />
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
