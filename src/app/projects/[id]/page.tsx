"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2, Sparkles, Play, Download, Save, RotateCcw, ArrowUp, ArrowDown, Trash2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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

  if (!project) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const isBusy = project.status === "rendering";
  const isPlanned = project.status === "planned" || project.status === "rendering" || project.status === "done";
  const isDone = project.status === "done" && project.output_path;
  const segmentsChanged = timeline && JSON.stringify(timeline.segments) !== JSON.stringify(editedSegments);
  const totalLen = (segs: Segment[]) => segs.reduce((a, s) => a + (s.trimEnd !== null ? s.trimEnd - s.trimStart : 0), 0);

  const moveUp = (i: number) => { if (i === 0) return; const n = [...editedSegments]; [n[i-1], n[i]] = [n[i], n[i-1]]; setEditedSegments(n); };
  const moveDown = (i: number) => { if (i === editedSegments.length - 1) return; const n = [...editedSegments]; [n[i+1], n[i]] = [n[i], n[i+1]]; setEditedSegments(n); };
  const remove = (i: number) => setEditedSegments(editedSegments.filter((_, idx) => idx !== i));

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-4xl">
        <Link href="/projects" className="text-sm text-muted-foreground hover:text-foreground mb-4 inline-block">
          <ArrowLeft className="inline h-4 w-4" /> All recreations
        </Link>

        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold">{project.name}</h1>
          <Badge>{project.status}</Badge>
        </div>
        {sourceTitle && <p className="text-sm text-muted-foreground mb-6">Recreating: <span className="font-medium text-foreground">{sourceTitle}</span></p>}

        {project.error && (
          <Card className="mb-6 border-destructive">
            <CardContent className="p-4 text-sm text-destructive">
              <p className="font-medium">Error</p><p className="mt-1">{project.error}</p>
            </CardContent>
          </Card>
        )}

        <Card className="mb-6">
          <CardContent className="p-4 space-y-3">
            <div>
              <p className="text-sm font-medium mb-1">Recreate with AI</p>
              <p className="text-xs text-muted-foreground mb-2">Rewords the script (same meaning) and reshuffles scenes into a fresh variant.</p>
              <Textarea value={instructions} onChange={(e) => setInstructions(e.target.value)}
                placeholder="Optional style notes (e.g. 'punchier tone', 'keep the intro first')…" rows={2} />
            </div>
            <div className="flex gap-2">
              <Button onClick={recreate} disabled={recreating || isBusy} size="sm">
                {recreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {recreating ? "Recreating…" : isPlanned ? "Recreate again" : "Recreate with AI"}
              </Button>
              {isPlanned && !showEditor && (
                <Button onClick={render} disabled={rendering || isBusy} size="sm">
                  {rendering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  {rendering ? "Rendering…" : "Render Video"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {isPlanned && timeline && (
          <Card className="mb-6">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{showEditor ? "Edit scene order" : "New script"}</p>
                  <p className="text-xs text-muted-foreground">
                    {(showEditor ? editedSegments : timeline.segments).length} scenes · ~{formatTime(totalLen(showEditor ? editedSegments : timeline.segments))} total
                  </p>
                </div>
                <div className="flex gap-2">
                  {!showEditor && (
                    <Button variant="outline" size="sm" onClick={() => setShowEditor(true)}>
                      <RotateCcw className="h-4 w-4" /> Edit scenes
                    </Button>
                  )}
                  {showEditor && (
                    <>
                      <Button variant="outline" size="sm" onClick={() => { setEditedSegments(timeline.segments); setShowEditor(false); }}>Cancel</Button>
                      <Button size="sm" onClick={saveTimelineAndRender} disabled={saving || !segmentsChanged}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {saving ? "Saving…" : "Save & Re-render"}
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {showEditor ? (
                <div className="space-y-2">
                  {editedSegments.map((seg, i) => (
                    <div key={i} className="flex items-start gap-3 p-2 rounded border border-border">
                      <div className="flex flex-col items-center pt-1">
                        <button onClick={() => moveUp(i)} disabled={i === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                        <span className="text-xs">{i+1}</span>
                        <button onClick={() => moveDown(i)} disabled={i === editedSegments.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{seg.sceneTitle || `Scene ${i+1}`}</p>
                        <p className="text-xs text-muted-foreground">{formatTime(seg.trimStart)}{seg.trimEnd !== null ? ` – ${formatTime(seg.trimEnd)}` : " – end"}</p>
                        {seg.newText && <p className="text-xs mt-1 line-clamp-2">{seg.newText}</p>}
                      </div>
                      <button onClick={() => remove(i)} className="text-muted-foreground hover:text-destructive pt-1"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {timeline.segments.map((seg, i) => (
                    <div key={i} className="p-3 rounded border border-border">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">{i+1}. {seg.sceneTitle || `Scene ${i+1}`}</p>
                        <span className="text-xs text-muted-foreground shrink-0">{formatTime(seg.trimStart)}{seg.trimEnd !== null ? ` – ${formatTime(seg.trimEnd)}` : " – end"}</span>
                      </div>
                      {seg.newText && <p className="text-sm mt-1">{seg.newText}</p>}
                      {seg.originalText && <p className="text-xs text-muted-foreground mt-1 italic line-clamp-2">was: {seg.originalText}</p>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {isDone && !showEditor && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <p className="font-medium">Recreated video</p>
              <video src={`/api/projects/${id}/output`} controls className="w-full max-w-sm mx-auto rounded" />
              <a href={`/api/projects/${id}/output`} download>
                <Button variant="outline" size="sm"><Download className="h-4 w-4" /> Download MP4</Button>
              </a>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
