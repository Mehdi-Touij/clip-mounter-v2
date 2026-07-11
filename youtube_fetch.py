#!/usr/bin/env python3
"""
YouTube fetch helper — transcript, metadata, and video download.

NO PROXIES. Everything runs directly from the host (the VPS), the free way:
  - yt-dlp with your browser cookies (optional but strongly recommended)
  - player-client rotation to dodge intermittent blocks
  - built-in retries + socket timeouts

Actions:
  youtube_fetch.py <video_id> info
  youtube_fetch.py <video_id> transcript [lang]
  youtube_fetch.py <video_id> download <output_path>

All results are printed as a single JSON object/array on stdout.
Diagnostics go to stderr.
"""
import json
import os
import subprocess
import sys
import tempfile

YT_DLP = os.environ.get("YT_DLP", "yt-dlp")
# Order matters: clients that usually work without login/PO-token first.
PLAYER_CLIENTS = os.environ.get(
    "YT_PLAYER_CLIENTS", "default,web_safari,tv,android,ios"
).split(",")


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def cookies_args():
    """Return ['--cookies', path] only if a *real* cookies file is present."""
    path = os.environ.get("YT_COOKIES", "youtube-cookies.txt")
    try:
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8", errors="ignore") as f:
                body = f.read()
            # A template file has only comment lines; a real Netscape cookie
            # jar has tab-separated data rows mentioning the domain.
            if "youtube.com" in body or "\t" in body.replace("# ", ""):
                data_lines = [
                    ln for ln in body.splitlines()
                    if ln.strip() and not ln.strip().startswith("#")
                ]
                if data_lines:
                    return ["--cookies", path]
    except Exception as e:
        log(f"cookies check failed: {e}")
    return []


def base_args(client=None):
    args = [
        YT_DLP,
        "--no-playlist",
        "--no-warnings",
        "--socket-timeout", "30",
        "--retries", "5",
        "--fragment-retries", "10",
        "--force-ipv4",
    ]
    args += cookies_args()
    if client and client != "default":
        args += ["--extractor-args", f"youtube:player_client={client}"]
    return args


def yt_url(video_id):
    return f"https://www.youtube.com/watch?v={video_id}"


def run(args, timeout):
    return subprocess.run(args, capture_output=True, text=True, timeout=timeout)


# ---------------------------------------------------------------- info

def fetch_info(video_id):
    for client in PLAYER_CLIENTS:
        try:
            r = run(base_args(client) + ["--dump-json", "--skip-download", yt_url(video_id)], 60)
            if r.returncode == 0 and r.stdout.strip():
                info = json.loads(r.stdout.strip().splitlines()[0])
                return {
                    "title": info.get("title", f"YouTube {video_id}"),
                    "duration": info.get("duration", 0) or 0,
                    "channel": info.get("channel") or info.get("uploader") or "",
                    "thumbnail": info.get("thumbnail")
                    or f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg",
                }
            log(f"info[{client}] rc={r.returncode}: {r.stderr.strip()[-160:]}")
        except Exception as e:
            log(f"info[{client}] err: {e}")
    return None


# ---------------------------------------------------------------- transcript

def _clean_segments(raw):
    """Drop empties and consecutive duplicate cues (auto-caption rolling text)."""
    out = []
    last = None
    for s in raw:
        text = (s.get("text") or "").replace("\n", " ").strip()
        if not text or text == last:
            continue
        out.append({"start": float(s["start"]), "end": float(s["end"]), "text": text})
        last = text
    return out


def transcript_via_api(video_id, lang):
    """Primary: youtube-transcript-api, direct (no proxy). Clean phrase-level cues."""
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
    except Exception as e:
        log(f"youtube_transcript_api unavailable: {e}")
        return None
    try:
        api = YouTubeTranscriptApi()
        # Newer API exposes .fetch(); older exposes static get_transcript().
        if hasattr(api, "fetch"):
            tr = api.fetch(video_id, languages=[lang, "en"]) if _accepts_langs(api.fetch) else api.fetch(video_id)
            segs = [{"start": s.start, "end": s.start + s.duration, "text": s.text} for s in tr]
        else:  # pragma: no cover - old versions
            tr = YouTubeTranscriptApi.get_transcript(video_id, languages=[lang, "en"])
            segs = [{"start": s["start"], "end": s["start"] + s["duration"], "text": s["text"]} for s in tr]
        return _clean_segments(segs)
    except Exception as e:
        log(f"transcript_via_api failed: {str(e)[-160:]}")
        return None


def _accepts_langs(fn):
    try:
        import inspect
        return "languages" in inspect.signature(fn).parameters
    except Exception:
        return False


def transcript_via_ytdlp(video_id, lang):
    """Fallback: yt-dlp subtitles as json3 (has timestamps). Uses same path as download."""
    with tempfile.TemporaryDirectory() as td:
        out_tmpl = os.path.join(td, "%(id)s.%(ext)s")
        for client in PLAYER_CLIENTS:
            try:
                r = run(
                    base_args(client)
                    + [
                        "--skip-download",
                        "--write-auto-subs",
                        "--write-subs",
                        "--sub-langs", f"{lang}.*,{lang},en.*,en",
                        "--sub-format", "json3",
                        "-o", out_tmpl,
                        yt_url(video_id),
                    ],
                    120,
                )
                files = [f for f in os.listdir(td) if f.endswith(".json3")]
                if not files:
                    log(f"transcript ytdlp[{client}] no subs: {r.stderr.strip()[-120:]}")
                    continue
                # Prefer a manual/exact-lang track if several exist.
                files.sort(key=lambda f: (f".{lang}." not in f, len(f)))
                with open(os.path.join(td, files[0]), "r", encoding="utf-8") as fh:
                    data = json.load(fh)
                raw = []
                for ev in data.get("events", []):
                    if "segs" not in ev:
                        continue
                    text = "".join(seg.get("utf8", "") for seg in ev["segs"])
                    start = ev.get("tStartMs", 0) / 1000.0
                    dur = ev.get("dDurationMs", 0) / 1000.0
                    raw.append({"start": start, "end": start + dur, "text": text})
                cleaned = _clean_segments(raw)
                if cleaned:
                    return cleaned
            except Exception as e:
                log(f"transcript ytdlp[{client}] err: {e}")
    return None


def fetch_transcript(video_id, lang="en"):
    return transcript_via_api(video_id, lang) or transcript_via_ytdlp(video_id, lang)


# ---------------------------------------------------------------- download

FORMAT = (
    "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/"
    "b[height<=1080][ext=mp4]/"
    "bv*[height<=1080]+ba/b[height<=1080]/b"
)


def download_video(video_id, output_path, timeout=600):
    os.makedirs(os.path.dirname(os.path.abspath(output_path)) or ".", exist_ok=True)
    for client in PLAYER_CLIENTS:
        try:
            r = run(
                base_args(client)
                + [
                    "-f", FORMAT,
                    "--merge-output-format", "mp4",
                    "-N", "4",  # concurrent fragments
                    "-o", output_path,
                    yt_url(video_id),
                ],
                timeout,
            )
            if os.path.exists(output_path) and os.path.getsize(output_path) > 10_000:
                log(f"download ok via client={client}")
                return True
            log(f"download[{client}] rc={r.returncode}: {r.stderr.strip()[-200:]}")
        except subprocess.TimeoutExpired:
            log(f"download[{client}] timeout")
        except Exception as e:
            log(f"download[{client}] err: {e}")
        # Clean partial before next client tries.
        for p in (output_path, output_path + ".part"):
            try:
                if os.path.exists(p):
                    os.remove(p)
            except Exception:
                pass
    return False


# ---------------------------------------------------------------- CLI

def main():
    if len(sys.argv) < 3:
        log("Usage: youtube_fetch.py <video_id> <info|transcript|download> [arg]")
        sys.exit(2)
    video_id = sys.argv[1]
    action = sys.argv[2]

    if action == "info":
        info = fetch_info(video_id)
        if info is None:
            print(json.dumps({"error": "info_failed"}))
            sys.exit(1)
        print(json.dumps(info))

    elif action == "transcript":
        lang = sys.argv[3] if len(sys.argv) > 3 else "en"
        segs = fetch_transcript(video_id, lang)
        if not segs:
            log("transcript unavailable")
            print(json.dumps([]))
            sys.exit(1)
        print(json.dumps(segs))

    elif action == "download":
        if len(sys.argv) < 4:
            log("download requires <output_path>")
            sys.exit(2)
        output_path = sys.argv[3]
        ok = download_video(video_id, output_path)
        if ok:
            print(json.dumps({"success": True, "path": output_path, "size": os.path.getsize(output_path)}))
        else:
            print(json.dumps({"success": False}))
            sys.exit(1)
    else:
        log(f"unknown action: {action}")
        sys.exit(2)


if __name__ == "__main__":
    main()
