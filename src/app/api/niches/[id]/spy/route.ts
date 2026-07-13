// GET /api/niches/[id]/spy — competitor intelligence: channels (with stats),
// top videos by views, and aggregate metrics (views = public; revenue = estimate).
import { NextRequest, NextResponse } from "next/server";
import { listChannels, listChannelVideos } from "@/lib/db";

const EST_RPM = 4; // USD per 1000 views — rough niche estimate, NOT actual revenue.

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const channels = await listChannels(id);
  const videos = await listChannelVideos(id, 200);

  const totalViews = videos.reduce((a, v) => a + v.views, 0);
  const avgViews = videos.length ? Math.round(totalViews / videos.length) : 0;

  const top = videos.slice(0, 12).map((v) => ({
    id: v.id, youtube_id: v.youtube_id, title: v.title, channel: v.channel_title,
    views: v.views, duration: v.duration, published_at: v.published_at,
    thumbnail: v.thumbnail, indexed: v.indexed, estRevenue: Math.round((v.views / 1000) * EST_RPM),
  }));

  return NextResponse.json({
    channels: channels.map((c) => ({ id: c.id, title: c.title || c.handle, subscribers: c.subscribers, video_count: c.video_count, status: c.status })),
    metrics: { channels: channels.length, videos: videos.length, totalViews, avgViews, estRpm: EST_RPM },
    top,
  });
}
