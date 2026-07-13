// POST /api/niches/[id]/sync — pull each competitor channel's recent uploads + stats
// via the YouTube Data API (cheap endpoints only). Stores them for the spy dashboard.
import { NextRequest, NextResponse } from "next/server";
import { getNiche, listChannels, updateChannel, upsertChannelVideo } from "@/lib/db";
import { resolveChannel, listUploads } from "@/lib/youtube";

const MAX_UPLOADS = 50;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getNiche(id))) return NextResponse.json({ error: "Niche not found" }, { status: 404 });
  if (!process.env.YT_API_KEY) return NextResponse.json({ error: "YouTube API key not configured" }, { status: 400 });

  const channels = await listChannels(id);
  if (channels.length === 0) return NextResponse.json({ error: "Add competitor channels first" }, { status: 400 });

  let synced = 0, videos = 0;
  const errors: string[] = [];

  for (const ch of channels) {
    try {
      await updateChannel(ch.id, { status: "syncing" });
      const info = await resolveChannel(ch.url || ch.handle);
      if (!info) { await updateChannel(ch.id, { status: "error" }); errors.push(`Could not resolve ${ch.handle}`); continue; }
      await updateChannel(ch.id, {
        title: info.title, channel_id: info.channelId, subscribers: info.subscribers,
        video_count: info.videoCount, status: "synced", last_synced: new Date().toISOString(),
      });
      const uploads = await listUploads(info.uploads, info.title, MAX_UPLOADS);
      for (const u of uploads) {
        await upsertChannelVideo({
          niche_id: id, channel_ref: ch.id, channel_title: info.title,
          youtube_id: u.youtubeId, title: u.title, published_at: u.publishedAt,
          views: u.views, likes: u.likes, comments: u.comments, duration: u.duration, thumbnail: u.thumbnail,
        });
        videos++;
      }
      synced++;
    } catch (e) {
      await updateChannel(ch.id, { status: "error" });
      errors.push(`${ch.handle}: ${(e as Error).message}`.slice(0, 160));
    }
  }

  return NextResponse.json({ synced, videos, errors });
}
