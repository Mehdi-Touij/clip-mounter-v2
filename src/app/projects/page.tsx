"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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

  useEffect(() => { fetchProjects(); fetchVideos(); }, [fetchProjects, fetchVideos]);

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
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Recreations</h1>
          <Link href="/library"><Button variant="outline" size="sm">← Library</Button></Link>
        </div>

        <Card className="mb-6">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-medium">New recreation</p>
            <p className="text-xs text-muted-foreground">Pick a video — the AI rewords its script and reshuffles scenes into a fresh, same-meaning variant.</p>
            <input
              className="w-full px-3 py-2 rounded border border-input bg-background text-sm"
              placeholder="Project name…"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <select
              className="w-full px-3 py-2 rounded border border-input bg-background text-sm"
              value={sourceVideoId}
              onChange={(e) => setSourceVideoId(e.target.value)}
            >
              <option value="">Select a source video…</option>
              {ready.map((v) => (
                <option key={v.id} value={v.id}>{v.title} ({Math.round(v.duration)}s)</option>
              ))}
            </select>
            {ready.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No ready videos yet. <Link href="/library" className="underline">Add one in the Library</Link> and wait for it to transcribe + download.
              </p>
            )}
            <Button onClick={createProject} disabled={creating || !name.trim() || !sourceVideoId}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Create
            </Button>
          </CardContent>
        </Card>

        {projects.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">No recreations yet.</p>
        ) : (
          <div className="space-y-2">
            {projects.map((p) => (
              <Link key={p.id} href={`/projects/${p.id}`}>
                <Card className="hover:border-primary transition-colors mb-2">
                  <CardContent className="p-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.created_at}</p>
                    </div>
                    <Badge>{p.status}</Badge>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
