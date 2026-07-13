// RSS/Atom news fetching for a niche's sources.
import Parser from "rss-parser";

const parser = new Parser({ timeout: 15000 });

export interface FeedItem { title: string; link: string; published_at: string; summary: string }

export async function fetchFeed(url: string): Promise<FeedItem[]> {
  const feed = await parser.parseURL(url);
  return (feed.items ?? []).slice(0, 30).map((it) => ({
    title: (it.title ?? "").trim(),
    link: (it.link ?? it.guid ?? "").trim(),
    published_at: (it.isoDate ?? it.pubDate ?? "").trim(),
    summary: (it.contentSnippet ?? it.content ?? "").replace(/\s+/g, " ").trim().slice(0, 400),
  })).filter((i) => i.title && i.link);
}
