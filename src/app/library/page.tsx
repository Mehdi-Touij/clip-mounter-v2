"use client";

import { useEffect, useState, useCallback } from "react";
import { Video, Loader2, Trash2, Clock, Search, FileText } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

interface Video {
  id: string;
  youtube_url: string;
  youtube_id: string;
  title: string;
  channel: string;
  duration: number;
  thumbnail_url: string;
  transcript_status: string;
  transcript: string;
  created_at: string;
}

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
    const interval = setInterval(fetchVideos, 5000);
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
    fetchVideos();
  };

  const filteredVideos = search
    ? videos.filter((v) =>
        v.transcript?.toLowerCase().includes(search.toLowerCase()) ||
        v.title?.toLowerCase().includes(search.toLowerCase())
      )
    : videos;

  const formatDuration = (s: number) => {
    if (!s) return "—";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const statusBadge = (status: string) => {
    if (status === "done") return <Badge className="bg-green-500">Ready</Badge>;
    if (status === "pending") return <Badge variant="secondary">Pending…</Badge>;
    if (status === "downloading") return <Badge variant="secondary">Downloading…</Badge>;
    if (status === "transcribing") return <Badge variant="secondary">Transcribing…</Badge>;
    if (status === "error") return <Badge variant="destructive">Error</Badge>;
    return <Badge variant="secondary">{status}</Badge>;
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Video Library</h1>
          <Link href="/projects">
            <Button variant="outline" size="sm">Projects →</Button>
          </Link>
        </div>

        {/* Add YouTube URL */}
        <Card className="mb-6">
          <CardContent className="p-4 flex gap-2">
            <Video className="h-6 w-6 text-red-500 flex-shrink-0 mt-1" />
            <Input
              placeholder="Paste YouTube link…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addVideo()}
            />
            <Button onClick={addVideo} disabled={loading || !url.trim()}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
            </Button>
          </CardContent>
        </Card>

        {/* Search */}
        <div className="flex items-center gap-2 mb-4">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search transcripts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
        </div>

        {/* Video grid */}
        {filteredVideos.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">
            {videos.length === 0 ? "No videos yet. Paste a YouTube link to get started." : "No results found."}
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredVideos.map((v) => (
              <Card key={v.id} className="overflow-hidden cursor-pointer" onClick={() => setSelectedVideo(v)}>
                <div className="aspect-video bg-muted relative">
                  <img
                    src={v.thumbnail_url}
                    alt={v.title}
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                </div>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{v.title}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        {statusBadge(v.transcript_status)}
                        {v.duration > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            <Clock className="h-3 w-3 mr-0.5" />
                            {formatDuration(v.duration)}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteVideo(v.id); }}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Transcript viewer modal */}
        {selectedVideo && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setSelectedVideo(null)}>
            <Card className="max-w-2xl w-full max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold">{selectedVideo.title}</h2>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedVideo(null)}>Close</Button>
                </div>
                {selectedVideo.transcript ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 mb-2">
                      <FileText className="h-4 w-4" />
                      <span className="text-sm font-medium">Transcript</span>
                    </div>
                    <pre className="text-sm whitespace-pre-wrap font-mono text-muted-foreground">
                      {selectedVideo.transcript}
                    </pre>
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    {selectedVideo.transcript_status === "done" ? "No transcript available." : "Transcription in progress…"}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}