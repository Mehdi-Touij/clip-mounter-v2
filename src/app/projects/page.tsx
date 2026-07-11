"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Loader2, Wand2, Film, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/status-pill";

interface Project {
  id: string;
  name: string;
  status: string;
  created_at: string;
}

interface Video {
  id: string;
  title: string;
  duration: number;
  transcript_status: string;
  download_status: string;
}

export function projectStatus(status: string): { label: string; tone: "green" | "blue" | "amber" | "red" | "violet" | "muted"; pulse?: boolean } {
  switch (status) {
    case "done": return { label: "Done", tone: "green" };
    case "rendering": return { label: "Rendering", tone: "blue", pulse: true };
    case "planned": return { label: "Ready to render", tone: "violet" };
    case "error": return { label: "Error", tone: "red" };
    default: return { label: "Draft", tone: "muted" };
  }
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [sourceVideoId, setSourceVideoId] = useState("");

  const fetchProjects = useCallback(async () => {
    const res = await fetch("/api/projects");
    const data = await res.json();
    setProjects(data.projects ?? []);
  }, []);

  const fetchVideos = useCallback(async () => {
    const res = await fetch("/api/videos");
    const data = await res.json();
    setVideos(data.videos ?? []);
  }, []);

  useEffect(() => {
    fetchProjects();
    fetchVideos();
    const interval = setInterval(fetchProjects, 4000);
    return () => clearInterval(interval);
  }, [fetchProjects, fetchVideos]);

  const ready = videos.filter((v) => v.transcript_status === "done" && v.download_status === "downloaded");

  const createProject = async () => {
    if (!name.trim() || !sourceVideoId) return;
    setCreating(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, sourceVideoId }),
      });
      const data = await res.json();
      if (data.id) window.location.href = `/projects/${data.id}`;
      else alert(data.error ?? "Could not create project");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 md:px-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Recreations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick a video — the AI rewords its script and reshuffles scenes into a fresh, same-meaning variant.
        </p>
      </header>

      {/* New recreation panel */}
      <div className="mb-8 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
            <Wand2 className="h-4 w-4" />
          </span>
          <p className="text-sm font-semibold">New recreation</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Project name</label>
            <input
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
              placeholder="e.g. Jobs speech — variant A"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Source video</label>
            <select
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-60"
              value={sourceVideoId}
              onChange={(e) => setSourceVideoId(e.target.value)}
              disabled={ready.length === 0}
            >
              <option value="">Select a video…</option>
              {ready.map((v) => (
                <option key={v.id} value={v.id}>{v.title} ({Math.round(v.duration)}s)</option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          {ready.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No ready videos yet. <Link href="/library" className="font-medium text-primary underline-offset-2 hover:underline">Add one in the Library</Link>.
            </p>
          ) : <span />}
          <Button onClick={createProject} disabled={creating || !name.trim() || !sourceVideoId}>
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            Create recreation
          </Button>
        </div>
      </div>

      {/* List */}
      {projects.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border py-16 text-center">
          <Film className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-medium">No recreations yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Create one above to get started.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {projects.map((p) => {
            const st = projectStatus(p.status);
            return (
              <Link key={p.id} href={`/projects/${p.id}`} className="block">
                <div className="group flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:border-primary/40 hover:shadow-md">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{p.created_at}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusPill tone={st.tone} pulse={st.pulse}>{st.label}</StatusPill>
                    <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
