# Deploy — collapsed single-VPS architecture

Everything (web UI + API + worker + SQLite + video files + rendered outputs) runs
in **one place: your VPS**. There is no Railway↔VPS split and no file transfer over
HTTP anymore — that eliminated the ephemeral-DB wipe, the upload hangs, and the
render-coordination bugs.

```
                 ┌────────────────────── VPS (Debian, 8GB) ──────────────────────┐
   browser ──►  Caddy (:80/:443)  ──►  app container                              │
                                        ├─ Next.js  (web + API)                    │
                                        └─ worker    (ingest + render loops)       │
                                             │                                     │
                                        /data volume (persists across restarts)    │
                                        ├─ clip-mounter.db   (SQLite, WAL)         │
                                        ├─ videos/<id>.mp4    (downloaded at add)   │
                                        └─ outputs/<proj>.mp4 (rendered)           │
                └───────────────────────────────────────────────────────────────┘
```

Web and worker are two processes on the same box that open the **same SQLite file**
directly (WAL mode → safe concurrent access). The worker never makes an HTTP call.

## 1. Prerequisites on the VPS

- Docker + Docker Compose plugin
- Ports 80/443 open (443 only needed if you use a domain)

## 2. Get the code + configure

```bash
git clone https://github.com/Mehdi-Touij/clip-mounter-v2.git
cd clip-mounter-v2
cp .env.local.example .env        # docker-compose reads this
```

Edit `.env`:

```ini
OLLAMA_API_KEY=sk-...             # your Ollama Cloud key (AI planner)
PLANNER_MODEL=glm-5.2
# SITE_ADDRESS=clips.example.com  # set a domain → automatic HTTPS. Omit for http://<VPS-IP>
```

### Cookies (recommended for reliable downloads, still free)

Downloads run straight from the VPS with `yt-dlp`. A logged-in cookie jar makes them
far more reliable with **no proxy and no cost**:

1. In your browser, install a "Get cookies.txt" extension, open youtube.com while
   logged in, export **Netscape format**.
2. Save it as `youtube-cookies.txt` in the repo root (it's git-ignored; compose
   mounts it read-only). If absent, downloads still attempt anonymously.

## 3. Run

```bash
docker compose up -d --build
docker compose logs -f app        # watch ingest + render activity
```

Open `http://<VPS-IP>` (or your domain). Paste a YouTube link → the worker fetches
metadata + transcript and **downloads the file immediately** (at add-time, with
retries). When a card is "downloaded", it's renderable.

## 4. Operating notes

- **Data safety:** everything lives in `./data` on the host. Back it up; it survives
  `docker compose down && up`.
- **Retries:** each video gets `MAX_ATTEMPTS` (default 4) tries across metadata /
  transcript / download before it's marked `error`. Delete + re-add to reset.
- **Keep yt-dlp fresh:** YouTube changes often. Rebuild periodically to pull the
  latest yt-dlp: `docker compose build --no-cache app && docker compose up -d`.
- **Crash recovery:** if the worker dies mid-render, the job is auto-requeued on the
  next start (`recoverStuckJobs`), and `start.sh` restarts the worker automatically.
- **Player clients:** tune `YT_PLAYER_CLIENTS` in `.env` if a client stops working.

## Migrating off the old Railway + VPS split

The old flow (Railway web + SQLite, separate VPS worker, MP4 upload back to Railway)
is fully replaced. You can decommission the Railway service. If you want to keep the
Railway URL, point it at the VPS with a redirect/proxy — but it's no longer required.
Old data on Railway's ephemeral disk isn't migrated (it was being wiped anyway); just
re-add the YouTube links on the new instance.
```
