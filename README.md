# clip-mounter-v2

Paste YouTube links → the app fetches transcripts + downloads the videos → you write
what you want in plain English → an AI planner finds the matching moments across your
whole library → it cuts and stitches them into one vertical **1080×1920** MP4 you can
preview, edit (reorder / delete / add scenes), and download.

## Architecture (collapsed single-VPS)

One machine runs the whole thing — no cross-network file transfer:

- **Next.js** — web UI + API (`src/app`)
- **worker** (`worker/index.ts`) — two independent loops on the same box:
  - *ingest*: metadata + transcript + **download at add-time** (retries, no proxy)
  - *render*: ffmpeg cut + stitch of already-downloaded files → 1080×1920 MP4
- **SQLite** (`src/lib/db.ts`) — WAL mode, opened directly by both processes
- **`youtube_fetch.py`** — `yt-dlp` + cookies + player-client rotation (no proxies)
- **AI planner** (`/api/projects/[id]/plan`) — Ollama Cloud (GLM), validates + clamps
  the returned timeline against the real library

See **[DEPLOY.md](DEPLOY.md)** for the full deployment.

## Local development

```bash
pnpm install                 # pnpm 10
pnpm dev                     # web app on http://localhost:3000
pnpm worker                  # ingest + render worker (needs yt-dlp + ffmpeg + python3 on PATH)
```

Requires locally: `ffmpeg`, `yt-dlp`, `python3` with `youtube-transcript-api`.
Data (DB, videos, outputs) is written under `./data`.

## How reliability was hardened

- Render jobs are **atomically claimed** and marked done → fixes the infinite re-render loop.
- Videos download **at add-time**, not render-time → renders never gamble on a live download.
- SQLite + files live on a **persistent volume** → survive restarts.
- Worker talks to the DB **directly** (no HTTP) with hard timeouts on every subprocess.
- Temp dirs are cleaned in `finally`; stuck jobs are recovered on worker restart.
