"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Trash2, Search, FileText, Video, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/status-pill";

interface Video {
  id: string;
  youtube_url: string;
  youtube_id: string;
  title: string;
  channel: string;
  duration: number;
  thumbnail_url: string;
  transcript_status: string;
  download_status: string;
  transcript: string;
  created_at: string;
}

function videoStatus(v: Video): { label: string; tone: "green" | "blue" | "amber" | "red" | "muted"; pulse?: boolean } {
  if (v.transcript_status === "error" || v.download_status === "error") return { label: "Failed", tone: "red" };
  if (v.download_status === "downloaded" && v.transcript_status === "done") return { label: "Ready", tone: "green" };
  if (v.download_status === "downloading") return { label: "Downloading", tone: "blue", pulse: true };
  if (v.transcript_status === "fetching") return { label: "Transcribing", tone: "amber", pulse: true };
  return { label: "Queued", tone: "muted", pulse: true };
}

const formatDuration = (s: number) => {
  if (!s) return null;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

export default function LibraryPage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);

  const fetchVideos = useCallback(async () => {
    const res = await fetch("/api/videos");
    const data = await res.json();
    setVideos(data.videos ?? []);
  }, []);

  useEffect(() => {
    fetchVideos();
    const interval = setInterval(fetchVideos, 4000);
    return () => clearInterval(interval);
  }, [fetchVideos]);

  const addVideo = async () => {
    if (!url.trim()) return;
    setLoading(true);
    try {
      await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      setUrl("");
      fetchVideos();
    } finally {
      setLoading(false);
    }
  };

  const deleteVideo = async (id: string) => {
    await fetch(`/api/videos/${id}`, { method: "DELETE" });
    setVideos((prev) => prev.filter((v) => v.id !== id));
  };

  const filtered = search
    ? videos.filter(
        (v) =>
          v.transcript?.toLowerCase().includes(search.toLowerCase()) ||
          v.title?.toLowerCase().includes(search.toLowerCase()),
      )
    : videos;

  const ready = videos.filter((v) => v.download_status === "downloaded" && v.transcript_status === "done").length;

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:px-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste a YouTube link — we fetch the timestamped transcript and download the video.
          {videos.length > 0 && <> · {ready}/{videos.length} ready</>}
        </p>
      </header>

      {/* Add panel */}
      <div className="mb-5 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex flex-1 items-center gap-3 rounded-xl border border-input bg-background px-3">
            <Video className="h-5 w-5 shrink-0 text-red-500" />
            <input
              className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              placeholder="https://www.youtube.com/watch?v=…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addVideo()}
            />
          </div>
          <Button onClick={addVideo} disabled={loading || !url.trim()} className="h-11 px-5">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add video
          </Button>
        </div>
      </div>

      {/* Search */}
      {videos.length > 0 && (
        <div className="relative mb-5 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search titles & transcripts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border py-16 text-center">
          <Video className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-medium">{videos.length === 0 ? "No videos yet" : "No matches"}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {videos.length === 0 ? "Paste a YouTube link above to get started." : "Try a different search."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((v) => {
            const st = videoStatus(v);
            const dur = formatDuration(v.duration);
            return (
              <div
                key={v.id}
                onClick={() => setSelectedVideo(v)}
                className="group cursor-pointer overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
              >
                <div className="relative aspect-video bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={v.thumbnail_url}
                    alt={v.title}
                    className="h-full w-full object-cover"
                    onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")}
                  />
                  {dur && (
                    <span className="absolute bottom-2 right-2 rounded-md bg-black/75 px-1.5 py-0.5 text-xs font-medium text-white">
                      {dur}
                    </span>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteVideo(v.id); }}
                    className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-lg bg-black/60 text-white/90 opacity-0 transition-opacity hover:bg-red-600 group-hover:opacity-100"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="p-3.5">
                  <p className="line-clamp-2 text-sm font-medium leading-snug">{v.title}</p>
                  {v.channel && <p className="mt-0.5 truncate text-xs text-muted-foreground">{v.channel}</p>}
                  <div className="mt-2.5 flex items-center justify-between">
                    <StatusPill tone={st.tone} pulse={st.pulse}>{st.label}</StatusPill>
                    {v.transcript && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <FileText className="h-3.5 w-3.5" /> transcript
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Transcript modal */}
      {selectedVideo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setSelectedVideo(null)}
        >
          <div
            className="flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-border p-4">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold">{selectedVideo.title}</h2>
                {selectedVideo.channel && <p className="truncate text-xs text-muted-foreground">{selectedVideo.channel}</p>}
              </div>
              <button
                onClick={() => setSelectedVideo(null)}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-auto p-4">
              {selectedVideo.transcript ? (
                <pre className="whitespace-pre-wrap font-mono text-[13px] leading-relaxed text-muted-foreground">
                  {selectedVideo.transcript}
                </pre>
              ) : (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  {selectedVideo.transcript_status === "error" ? "No transcript available." : "Transcription in progress…"}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
