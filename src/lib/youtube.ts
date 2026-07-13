// YouTube Data API v3 — competitor spy. Uses only cheap endpoints (channels.list,
// playlistItems.list, videos.list) — no search.list (100 units). ~4 units per channel.
const API = "https://www.googleapis.com/youtube/v3";
const KEY = () => process.env.YT_API_KEY ?? "";

export interface ChannelInfo {
  channelId: string; title: string; subscribers: number; videoCount: number; uploads: string; thumbnail: string;
}
export interface UploadVideo {
  youtubeId: string; title: string; publishedAt: string; views: number; likes: number; comments: number; duration: number; thumbnail: string;
}

async function get(path: string, params: Record<string, string>) {
  const url = new URL(`${API}/${path}`);
  Object.entries({ ...params, key: KEY() }).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? `YouTube API ${res.status}`);
  return data;
}

// ISO-8601 duration (PT#H#M#S) → seconds.
function parseDuration(iso: string): number {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || "");
  if (!m) return 0;
  return (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0));
}

/** Resolve a handle / channel URL → channel info (incl. uploads playlist). */
export async function resolveChannel(handleOrUrl: string): Promise<ChannelInfo | null> {
  const s = handleOrUrl.trim();
  const part = "snippet,statistics,contentDetails";
  const attempts: Record<string, string>[] = [];
  const idMatch = s.match(/(UC[A-Za-z0-9_-]{22})/);
  const atMatch = s.match(/@([A-Za-z0-9._-]+)/);
  const userMatch = s.match(/\/user\/([A-Za-z0-9._-]+)/);
  if (idMatch) attempts.push({ part, id: idMatch[1] });
  if (atMatch) attempts.push({ part, forHandle: "@" + atMatch[1] });
  if (userMatch) attempts.push({ part, forUsername: userMatch[1] });
  if (!idMatch && !atMatch && !userMatch) attempts.push({ part, forHandle: "@" + s.replace(/^@/, "") });

  for (const params of attempts) {
    try {
      const d = await get("channels", params);
      const c = d.items?.[0];
      if (c) {
        return {
          channelId: c.id,
          title: c.snippet.title,
          subscribers: +(c.statistics.subscriberCount || 0),
          videoCount: +(c.statistics.videoCount || 0),
          uploads: c.contentDetails.relatedPlaylists.uploads,
          thumbnail: c.snippet.thumbnails?.default?.url ?? "",
        };
      }
    } catch { /* try next */ }
  }
  return null;
}

/** List a channel's most recent uploads (with stats), up to `max`. */
export async function listUploads(uploadsPlaylist: string, channelTitle: string, max = 50): Promise<UploadVideo[]> {
  const ids: string[] = [];
  let pageToken = "";
  while (ids.length < max) {
    const d = await get("playlistItems", {
      part: "contentDetails", playlistId: uploadsPlaylist,
      maxResults: String(Math.min(50, max - ids.length)), ...(pageToken ? { pageToken } : {}),
    });
    for (const it of d.items ?? []) ids.push(it.contentDetails.videoId);
    pageToken = d.nextPageToken ?? "";
    if (!pageToken) break;
  }
  const out: UploadVideo[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const d = await get("videos", { part: "snippet,statistics,contentDetails", id: batch.join(",") });
    for (const v of d.items ?? []) {
      out.push({
        youtubeId: v.id,
        title: v.snippet.title,
        publishedAt: v.snippet.publishedAt,
        views: +(v.statistics?.viewCount || 0),
        likes: +(v.statistics?.likeCount || 0),
        comments: +(v.statistics?.commentCount || 0),
        duration: parseDuration(v.contentDetails?.duration),
        thumbnail: v.snippet.thumbnails?.medium?.url ?? "",
      });
    }
  }
  void channelTitle;
  return out;
}
