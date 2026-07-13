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
- 🟡 **v2 Phase 2** — **Spy + Scene index** (the core engine):
  - ✅ **2a** — scene-index foundation: add competitor videos to a niche → ingest (transcript+download) → **keyword scene search** over transcript segments (exact timestamp + source). Done, live 2026-07-13.
  - ✅ **2b** — semantic (vector) scene search: local Transformers.js embeddings (all-MiniLM-L6-v2, 384-dim, WASM, cached on volume) → `scenes` table → cosine ranking. Done, live 2026-07-13.
  - ✅ **2c** — visual index: per-scene keyframe (ffmpeg) → local caption (Transformers.js vit-gpt2, WASM) → embedded as `spoken + [shows: caption]` so matching uses what's shown too. `reindexNiche` rebuilds. Done, live 2026-07-13. **Honest tradeoff:** CPU captioning is slow (~10s/keyframe) — a long video's backfill is ~10 min; fine as a background job, faster with a GPU or a cheap vision API if needed.
  - ✅ **2d** — competitor spy: YouTube Data API → resolve channels + pull uploads + stats → spy dashboard (metrics + top performers) → one-click "Index" into the scene library. Done, live 2026-07-13.
- 🟡 **v2 Phase 3** — AI producer:
  - ✅ **3a+3b** — RSS news ingestion + producer ranks daily video ideas from news + competitor top performers (LLM). Done, live 2026-07-13.
  - ✅ **3c** — assemble: idea → AI script → each beat matched to the best downloaded scene (semantic) → multi-source timeline → project → auto-render. Done, live 2026-07-13. (Match quality scales with how much of the library is indexed.)
- ✅ **v2 Phase 4** — ElevenLabs voiceover: assembled videos narrate the AI script over matched footage (per-scene TTS, footage looped to narration length; original-audio fallback on TTS error). Swappable provider (`src/lib/tts.ts`) → self-hosted Kokoro can replace it later. Done, live 2026-07-13.
- 🟡 **v2 Phase 5** — publishing:
  - ✅ **5a** — publish-prep: AI SEO title/description/tags (`/metadata`) + edit/schedule (`/publish`); Publish panel on finished videos. Done, live 2026-07-13.
  - ⬜ **5b** — YouTube OAuth upload (per-channel auth). Caveats: unverified apps upload **private** until Google audit; upload quota ~1600 units ≈ **~6/day** free.
  - ⬜ **5c** — performance feedback loop (re-poll our uploads' stats → feed the producer).

---

## 7. Key facts, deps & gotchas (institutional memory)

- **OLLAMA_API_KEY** is set in Railway env for both `app-gh` and `app-v2`. Not in the repo.
- **YT_API_KEY** (YouTube Data API v3) is set in `app-v2` Railway env. Free, 10k units/day. `youtube.ts` uses only cheap endpoints (channels/playlistItems/videos.list ≈ 4 units/channel) — **never `search.list`** (100 units).
- **ELEVENLABS_API_KEY** is set in `app-v2` env (free tier: ~10k chars/mo, no commercial rights — testing only; upgrade to Starter $5/mo for commercial). Optional `ELEVEN_VOICE_ID` / `ELEVEN_MODEL` (default `eleven_flash_v2_5`). For free-at-scale later: swap `src/lib/tts.ts` to self-hosted Kokoro.
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

### 2026-07-13 (late night 5) — CURATION + MULTI-SOURCE EDITOR
- **Event-level curation** (assemble): rank niche videos by relevance to the idea, draw scenes only from the top 4 → footage is now on-topic/coherent (verified: a "Charles 9/11 tribute" video used only 3 same-event clips vs scattered before). Per-beat precision still limited by the weak free captioner (vit-gpt2 hallucinates "cell phone" etc.) — a better vision model (Florence-2 / cheap Gemini vision) is the future precision lever.
- **Multi-source Studio**: the editor now opens on assembled (multi-source) videos — preview follows each scene's own source clip (swaps `<video>` src, resumes on canplay). Editing (reorder/trim/split/delete/export) verified working; recreation single-source path unchanged.
- **/file endpoint**: serve bounded ≤1MB buffered ranges (was open Readable.toWeb stream). 
- **KNOWN ISSUE (likely test-env only):** the live editor preview stalls at readyState 0 in the Claude-in-Chrome automated browser — but `fetch` of the file works, the endpoint returns correct `206`, the file is valid faststart H.264, and even Chrome's native player stalls *only in that MCP browser* (which filters traffic). **Needs verification in a normal browser** — editing + final render are unaffected.

### 2026-07-13 (late night 4) — VISUAL INDEX + QUALITY
- **Quality test** on the 11-video index revealed the honest gap: script/voice/SEO are production-quality, but **footage matching was loose** (abstract narration beats grabbed off-topic clips, incl. the off-niche Jobs test video). Cause: transcript-only matching + index pollution.
- **v2 Phase 2c shipped** — visual scene index. `src/lib/vision.ts` (Transformers.js vit-gpt2 image captioning, WASM; blip repos were access-blocked); `scenes.visual_caption` (+migration); worker scene step extracts a keyframe per scene → captions it → embeds `spoken + [shows: caption]`. `reindexNiche` + `/api/niches/[id]/reindex`; video delete now clears scenes; `sharp` added. Cleaned the royal niche (removed Jobs video). Captioning confirmed working live (worker logs `(+visual)`, clean `✓ indexed`). Backfill is slow on CPU (background job).

### 2026-07-13 (late night 3) — PUBLISH PREP
- **v2 Phase 5a shipped** — publish-prep. `projects.publish_json` (+migration); routes `/metadata` (AI SEO title+description+tags from the video's narration) and `/publish` (save edits/schedule/status); Publish panel on finished projects (generate + edit metadata, schedule, status). Verified live: assembled video → title "Why King Charles' 9/11 Tribute Left Everyone In Tears" + description + 12 tags. Real YouTube upload (5b) deferred — needs OAuth + unverified-app-private + ~6/day quota.

### 2026-07-13 (late night 2) — VOICEOVER
- **v2 Phase 4 shipped** — ElevenLabs voiceover. `src/lib/tts.ts` (ElevenLabs flash v2.5, swappable); `Timeline.voiceover` flag (assembled = true); worker render voiceover branch: per scene → silent scaled footage looped to the narration + AI voice on top (`-stream_loop -1 … -shortest`), original-audio fallback on TTS error. `ELEVENLABS_API_KEY` in `app-v2` env (free tier ~10k chars/mo ≈ dozens of test videos). Verified live: assembled royal idea → worker logged `voiced 1/6 … 6/6` → 43.7s MP4 whose length is paced by the narration.

### 2026-07-13 (late night) — FULL LOOP CLOSED
- **v2 Phase 3c shipped** — assembly. `/api/niches/[id]/ideas/[ideaId]/assemble`: LLM writes a script → each beat matched to the best unused downloaded scene (semantic) → multi-source timeline → project created + auto-rendered. `video_ideas.project_id` (+migration); `listNicheSceneRows` returns `download_status`/`youtube_url`; project page detects multi-source (assembled) and shows review+Export (hides single-source Studio/Recreate). Producer page: Assemble → rendering project → "Open video".
- **End-to-end verified live:** idea "Americans GO WILD for King Charles in Virginia" → AI script (6 royal beats) → matched scenes → **rendered a 48s 1080×1920 MP4**. The entire vision is now connected: niche → spy → scene index → producer → assemble → render → downloadable video. (Scene-match quality was thin because only 2 videos had finished embedding — improves with a fuller index.)
- Remaining: 2c visual index, Phase 4 ElevenLabs voiceover, Phase 5 publishing + feedback loop.

### 2026-07-13 (night)
- **v2 Phase 3 (3a+3b) shipped** — news + AI producer. `rss-parser` + `src/lib/news.ts`; `news_items` + `video_ideas` tables; routes `/news`, `/news/refresh`, `/produce`, `/ideas`; Producer page `/niches/[id]/produce` (Refresh news + Suggest today's videos → ranked idea cards). Verified live: 40 news items → 4 ranked royal video ideas whose rationale cited real competitor view counts (730K Shenandoah, 117K 9/11). Next: 3c assembly (idea → matched scenes → render).

### 2026-07-13 (evening)
- **v2 Phase 2d shipped** — competitor spy. `src/lib/youtube.ts` (YouTube Data API v3, cheap endpoints); `channel_videos` table; routes `/sync`, `/spy`, `/channel-videos/[cvid]/index`; niche UI Sync button + Competitor intelligence dashboard (metrics + top performers + one-click Index). `YT_API_KEY` set in `app-v2` env. Verified live: synced 4 royal channels → 200 videos, top = "The King explores Shenandoah National Park" 730k views (~$2,923 est).

### 2026-07-13 (later still)
- **v2 Phase 2b shipped** — semantic scene search. Added `@huggingface/transformers` (all-MiniLM-L6-v2, WASM, model cached to `/data/models`); `src/lib/embeddings.ts`; `scenes` table + worker `sceneIndexLoop` (chunk ~10s → embed → store). `/api/niches/[id]/scenes` ranks by cosine similarity (keyword fallback while indexing). **Ollama Cloud does NOT serve embeddings** (unauthorized) — so embeddings are fully local/free. Verified live: keyword-free queries returned the semantically-correct moments (e.g. "life is short so pursue what matters" → "Your time is limited…").

### 2026-07-13 (later)
- **v2 Phase 2a shipped** — scene-index foundation. `videos` gained `niche_id`; new routes `/api/niches/[id]/videos` (add/list, reuses the ingest pipeline) and `/api/niches/[id]/scenes` (keyword search over transcript segments). Niche page now has "Competitor videos" (live indexing status) + "Scene index" search. Verified live: indexed a 15-min video, searched "college" → 12 exact-timestamp scenes, "death" → 6, "connecting the dots" → 1.

### 2026-07-13
- **v2 Phase 1 shipped** — niche container (niches + competitor channels + news sources), new `Niches` nav, home → `/niches`, brand marked v2. Deployed to new isolated service `app-v2` (own volume, own DB). Verified live with the "UK royal family" niche (4 competitors, 2 RSS feeds). v1 confirmed still up and untouched.
- Created this source-of-truth file.
- **v1 milestones (same day):** collapsed architecture + reliability rebuild; recreation mode (reword + reshuffle); modern SaaS dashboard (sidebar, theme toggle, violet accent, status pills); Phase-1 timeline editor; Vibe-style full-screen Studio (module rail + preview + multi-lane timeline). All live on `app-gh`.
- Evaluated trigger.dev (not adopted — filesystem-coupling mismatch) and OSS video editors (built our own — licensing/render fit).
