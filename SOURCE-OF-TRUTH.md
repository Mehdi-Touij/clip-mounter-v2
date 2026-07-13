# Source of truth — Recut / clip-mounter-v2

The single living document for this project. Every decision, deployment, data-model
change, gotcha, and build step is recorded here. **Update this file at the end of every
work session** (see the Build log at the bottom). Last updated: **2026-07-13**.

> Repo: `github.com/Mehdi-Touij/clip-mounter-v2` · Local: `~/Desktop/clip-mounter-v2`

---

## 1. TL;DR — what this is

Two products in one repo, on two branches, deployed as two isolated Railway services:

| | What it is | Live URL | Branch | Railway service |
|---|---|---|---|---|
| **v1** | YouTube video **recreation** app — paste a link, AI rewords + reshuffles the transcript into a same-meaning variant, cut/stitch, edit in a Studio, export MP4. | https://app-gh-production.up.railway.app | `rebuild/vps-collapse` (frozen) | `app-gh` |
| **v2** | Niche-based **YouTube automation platform** — the full money-making vision (competitor spy → scene index → AI producer → factory → publish). Built ON v1. | https://app-v2-production-9e8f.up.railway.app | `v2` (active dev) | `app-v2` |

Both services live in the Railway project **`clip-mounter-test`** (id `663baf5d-3646-4989-97cc-89b6e748a113`), each with its **own `/data` volume** and **own SQLite DB** — fully isolated. Secrets (`OLLAMA_API_KEY`) are set in Railway env, **not** in the repo.

---

## 2. The v2 vision — 4 engines

A niche = a content vertical (e.g. "UK royal family"). Per niche:

```
NICHE ─┬─► ① RESEARCH ENGINE ──► "niche brain"
       │      • Competitor intel (channels → videos → stats)   [YouTube Data API]
       │      • News/trends intel (RSS feeds)
       │      • SCENE INDEX: transcribe → shot-detect → caption → vector DB
       │
       ├─► ② PRODUCER (AI) ──► ranked daily video ideas + scripts
       │
       ├─► ③ FACTORY ──► script → matched competitor scenes → ElevenLabs voiceover → render
       │      (this is v1 — recreation/editor/render, already built)
       │
       └─► ④ DISTRIBUTION + FEEDBACK ──► upload to your channels → track performance → learn
```

---

## 3. Locked decisions

1. **Footage source = competitor videos, NOT stock.** We download competitor clips and recut them with our script. (User decision, eyes open re: risk below.)
2. **Scene understanding = two layers:** (a) spoken transcript (what's said) + (b) **visual index** (what's shown) via shot-detection + a small self-hosted vision model. Visual layer is **free** (compute, not tokens) — decided to include it.
3. **Efficiency:** transcribe everything (cheap text), but **download clips on demand** only when a shot is picked — via `yt-dlp --download-sections "*START-END"` (fetches just the clip, not the whole video). Semantic **vector search** for scene matching (not brute-force LLM).
4. **Incremental sync:** backfill a channel once, then only ingest new daily uploads.
5. **Build in deployable phases**, keep v1 frozen and untouched while v2 evolves.
6. **No proxies, no paid services for downloads** — direct `yt-dlp` + cookies + player-client rotation.
7. **Own our stack for the editor** (no Remotion/DesignCombo — licensing; no OpenCut — client-render mismatch). Studio is built on our design system.

### ⚠️ The one risk to design around (not re-litigating — recording it)
Reusing competitor footage on monetized channels → **YouTube Content ID claims / copyright strikes / "reused content" demonetization**. The technical build is the same regardless; the money math must assume many videos get claimed. "How we transform enough to survive claims" is a product feature to design later, not an afterthought.

Also: **competitor revenue is not public** — the YouTube Data API gives views/likes/tags/publish-times only. "Revenue" is always an **estimate** (views × niche RPM).

---

## 4. Architecture & stack

- **Framework:** Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind v4 + shadcn-style components (`@base-ui/react`), lucide-react (v1.24.0 — note: **no `Youtube` icon**, use `Video`).
- **Package manager:** **pnpm 10** (repo uses `pnpm-workspace.yaml` with `allowBuilds`; pnpm 9 errors — pin `pnpm@10`).
- **DB:** SQLite via `better-sqlite3`, WAL mode, opened directly by both the web app and the worker (same machine).
- **Worker:** `worker/index.ts` (run via `tsx`), two loops — ingest (metadata+transcript+download at add-time) and render (ffmpeg cut+stitch). Talks to SQLite directly (no HTTP). Supervised + auto-restart in `start.sh`.
- **Media:** `yt-dlp` (transcript + download), `ffmpeg` (cut/normalize to 1080×1920, concat).
- **AI planner/recreator:** Ollama Cloud (OpenAI-compatible), model `glm-5.2`, key in `OLLAMA_API_KEY`.
- **Collapsed architecture:** web + worker + SQLite + video files + outputs all on ONE machine with a persistent volume. No cross-network file transfer (this fixed v1's original Railway↔VPS bugs).
- **Deploy:** Dockerfile (Debian bookworm-slim + ffmpeg + python3 + yt-dlp + build tools) → Railway **GitHub integration** builds per branch. `docker-compose.yml` + `Caddyfile` also provided for VPS.

---

## 5. Data model (SQLite)

**v1 tables**
- `videos` — id, youtube_url, youtube_id, title, channel, duration, thumbnail_url, storage_path, transcript, transcript_json, transcript_status (`pending|fetching|done|error`), download_status (`pending|downloading|downloaded|error`), attempts, last_error, timestamps.
- `projects` — id, name, **source_video_id**, script, status (`draft|planned|rendering|done|error`), timeline_json, output_path, error, created_at.
- `render_jobs` — id, project_id, status (`queued|processing|done|error`), attempts, error, timestamps. (Atomic claim + complete → fixes the old infinite re-render loop.)

**v2 tables**
- `niches` — id, name, description, language, format (`shorts|long`), videos_per_day, created_at.
- `niche_channels` — id, niche_id, url, handle, title, channel_id, subscribers, video_count, status (`added|syncing|synced|error`), last_synced, created_at.
- `niche_sources` — id, niche_id, type (`rss|page`), url, title, created_at.

**Timeline JSON contract** (`src/lib/types.ts`): `Timeline { fps, width, height, segments[] }`; `TimelineSegment { videoId, youtubeUrl, trimStart, trimEnd, sceneTitle?, newText?, originalText? }`. Cut timestamps always come from our stored transcript (authoritative), never the LLM.

**Planned v2 tables (Phase 2+):** `channel_videos` (per-video stats + transcript + download flag), `shots` (channel, video, start, end, spokenText, visualCaption, embedding), `news_items`, `video_ideas`, `productions`.

---

## 6. Phased roadmap

- ✅ **v1** — collapse to single machine, fix render loop + download reliability, recreation mode, modern dashboard UI, timeline editor, Vibe-style Studio. (Done, live.)
- ✅ **v2 Phase 1** — Niche container: niches + competitor channels + news sources. (Done, live 2026-07-13.)
- ⬜ **v2 Phase 2** — **Spy + Scene index** (the core engine):
  - Competitor spy: YouTube Data API → channel videos + stats. **Needs a YouTube Data API key.**
  - Scene index: transcribe → shot-detect (PySceneDetect) → caption (self-hosted Florence-2/Moondream/BLIP or CLIP) → embed → vector DB.
- ⬜ **v2 Phase 3** — AI producer: rank daily video ideas from news + winning competitor topics.
- ⬜ **v2 Phase 4** — wire producer → factory + **ElevenLabs voiceover** + scene matching from the index.
- ⬜ **v2 Phase 5** — publishing (upload/schedule to your channels) + performance feedback loop.

---

## 7. Key facts, deps & gotchas (institutional memory)

- **OLLAMA_API_KEY** is set in Railway env for both `app-gh` and `app-v2`. Not in the repo.
- **YouTube Data API key** — required for Phase 2 spy (free, from a Google Cloud project). Not yet provided.
- **Downloads:** direct `yt-dlp` from the server IP works surprisingly well even on Railway datacenter IPs (verified). If bot-walled at scale, drop a real `youtube-cookies.txt` (git-ignored, mounted read-only). No proxies.
- **Browser video preview:** the source MP4 loads fine (faststart H.264+AAC). Early "black preview" was **timing** (clicked Play before buffering) — fixed with first-frame seek + canplay guard. Detached `<video>` elements don't load media in Chrome (misleading when debugging).
- **Railway gotchas:** (1) Dockerfile **`VOLUME` instruction is rejected** — removed it; volumes are external. (2) `railway up` (CLI upload) failed silently at "scheduling build" — use the **GitHub integration** (`railway add --repo --branch`) instead. (3) `--ci` isn't the culprit; CLI-upload path itself was.
- **lucide-react 1.24.0** has no `Youtube` export → use `Video`.
- **pnpm:** pin `pnpm@10` (Dockerfile + local); pnpm 9 errors on `pnpm-workspace.yaml`.
- **Source video resolution** depends on the upload (e.g. the 2005 Jobs talk maxes at ~240p → soft output; modern HD is sharp).
- **Est. RPM / revenue** shown anywhere must be labeled as an estimate.

---

## 8. Ops runbook

**Local dev**
```bash
cd ~/Desktop/clip-mounter-v2
git checkout v2            # active dev branch (v1 = rebuild/vps-collapse, frozen)
npx pnpm@10 install
npx pnpm@10 build          # typecheck + build
npx pnpm@10 dev            # web on :3000  (needs yt-dlp + ffmpeg + python3 on PATH)
```

**Deploy v2** (auto on push to `v2`; GitHub integration builds `app-v2`)
```bash
git add -A && git commit -m "..." && git push origin v2
# watch: railway status --json   (service app-v2)
```
Railway CLI is authed as `touijelmehdi@outlook.com`. Project `clip-mounter-test`. Each service: DOCKERFILE builder, `/data` volume, envs `DATA_DIR=/data PLANNER_* OLLAMA_API_KEY MAX_ATTEMPTS`.

**Verify live**
```bash
curl -s <URL>/api/niches            # v2
curl -s <URL>/api/videos            # v1/v2 library
```

---

## 9. Build log (append newest at top)

### 2026-07-13
- **v2 Phase 1 shipped** — niche container (niches + competitor channels + news sources), new `Niches` nav, home → `/niches`, brand marked v2. Deployed to new isolated service `app-v2` (own volume, own DB). Verified live with the "UK royal family" niche (4 competitors, 2 RSS feeds). v1 confirmed still up and untouched.
- Created this source-of-truth file.
- **v1 milestones (same day):** collapsed architecture + reliability rebuild; recreation mode (reword + reshuffle); modern SaaS dashboard (sidebar, theme toggle, violet accent, status pills); Phase-1 timeline editor; Vibe-style full-screen Studio (module rail + preview + multi-lane timeline). All live on `app-gh`.
- Evaluated trigger.dev (not adopted — filesystem-coupling mismatch) and OSS video editors (built our own — licensing/render fit).
