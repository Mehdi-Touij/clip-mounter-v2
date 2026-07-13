"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Loader2, Target, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Niche {
  id: string;
  name: string;
  description: string;
  format: string;
  videos_per_day: number;
  created_at: string;
}

export default function NichesPage() {
  const [niches, setNiches] = useState<Niche[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [format, setFormat] = useState("shorts");
  const [perDay, setPerDay] = useState(4);
  const [creating, setCreating] = useState(false);

  const fetchNiches = useCallback(async () => {
    const res = await fetch("/api/niches");
    const data = await res.json();
    setNiches(data.niches ?? []);
  }, []);

  useEffect(() => { fetchNiches(); }, [fetchNiches]);

  const create = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/niches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, format, videos_per_day: perDay }),
      });
      const data = await res.json();
      if (data.id) window.location.href = `/niches/${data.id}`;
      else alert(data.error ?? "Could not create niche");
    } finally { setCreating(false); }
  };

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 md:px-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Niches</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A niche is a content vertical — its competitor channels and news sources feed the daily video engine.
        </p>
      </header>

      <div className="mb-8 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary"><Target className="h-4 w-4" /></span>
          <p className="text-sm font-semibold">New niche</p>
        </div>
        <div className="grid gap-3">
          <input className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
            placeholder="e.g. UK royal family" value={name} onChange={(e) => setName(e.target.value)} />
          <textarea className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/40"
            rows={2} placeholder="Short description of the niche…" value={description} onChange={(e) => setDescription(e.target.value)} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Format</label>
              <select className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                value={format} onChange={(e) => setFormat(e.target.value)}>
                <option value="shorts">Shorts (vertical, &lt;60s)</option>
                <option value="long">Long-form (horizontal)</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Videos per day</label>
              <input type="number" min={1} max={24} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                value={perDay} onChange={(e) => setPerDay(parseInt(e.target.value, 10) || 1)} />
            </div>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={create} disabled={creating || !name.trim()}>
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create niche
          </Button>
        </div>
      </div>

      {niches.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border py-16 text-center">
          <Target className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-medium">No niches yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Create one above to start tracking a vertical.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {niches.map((n) => (
            <Link key={n.id} href={`/niches/${n.id}`} className="block">
              <div className="group flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:border-primary/40 hover:shadow-md">
                <div className="min-w-0">
                  <p className="truncate font-medium">{n.name}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {n.format === "long" ? "Long-form" : "Shorts"} · {n.videos_per_day}/day{n.description ? ` · ${n.description}` : ""}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
