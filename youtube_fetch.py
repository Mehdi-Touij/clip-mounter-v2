#!/usr/bin/env python3
"""
Fetch YouTube transcript using free proxy rotation.
Uses youtube-transcript-api with free proxies from proxyscrape.com.
No API key, no signup, 100% free and open source.
"""
import sys
import json
import requests
from youtube_transcript_api import YouTubeTranscriptApi

def get_free_proxies():
    """Get free HTTP proxies from proxyscrape.com"""
    try:
        resp = requests.get(
            "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=5000&country=all&ssl=all&anonymity=all",
            timeout=10
        )
        return [p.strip() for p in resp.text.strip().split("\n") if p.strip()]
    except:
        return []

def fetch_transcript(video_id, lang="en"):
    """Fetch transcript with proxy rotation"""
    # Try direct first (works for some videos)
    try:
        api = YouTubeTranscriptApi()
        transcript = api.fetch(video_id)
        return [{
            "start": seg.start,
            "end": seg.start + seg.duration,
            "text": seg.text
        } for seg in transcript]
    except:
        pass

    # Try with free proxies
    proxies = get_free_proxies()
    print(f"Got {len(proxies)} free proxies", file=sys.stderr)

    for proxy in proxies[:20]:
        try:
            session = requests.Session()
            session.proxies = {"http": f"http://{proxy}", "https": f"http://{proxy}"}
            session.headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"

            # Quick test
            test = session.get("https://httpbin.org/ip", timeout=5)
            if test.status_code != 200:
                continue

            api = YouTubeTranscriptApi(http_client=session)
            transcript = api.fetch(video_id)
            segments = [{
                "start": seg.start,
                "end": seg.start + seg.duration,
                "text": seg.text
            } for seg in transcript]
            print(f"Success with proxy {proxy}", file=sys.stderr)
            return segments
        except:
            continue

    return None

def fetch_video_info(video_id):
    """Fetch video title and duration using free SOCKS5 proxy"""
    import subprocess

    # Try direct first
    try:
        r = subprocess.run([
            "/opt/data/.local/bin/yt-dlp", "--dump-json", f"https://www.youtube.com/watch?v={video_id}"
        ], capture_output=True, text=True, timeout=15)
        if r.returncode == 0 and r.stdout:
            info = json.loads(r.stdout)
            return info.get("title", "Unknown"), info.get("duration", 0)
    except:
        pass

    # Try with free SOCKS5 proxies
    try:
        resp = requests.get(
            "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks5&timeout=10000&country=all&ssl=all&anonymity=all",
            timeout=10
        )
        socks_proxies = [p.strip() for p in resp.text.strip().split("\n") if p.strip()]
        print(f"Got {len(socks_proxies)} SOCKS5 proxies", file=sys.stderr)

        for proxy in socks_proxies[:15]:
            try:
                r = subprocess.run([
                    "/opt/data/.local/bin/yt-dlp",
                    "--proxy", f"socks5://{proxy}",
                    "--dump-json",
                    f"https://www.youtube.com/watch?v={video_id}"
                ], capture_output=True, text=True, timeout=15)
                if r.returncode == 0 and r.stdout:
                    info = json.loads(r.stdout)
                    return info.get("title", "Unknown"), info.get("duration", 0)
            except:
                continue
    except:
        pass

    return "Unknown", 0

def download_video(video_id, output_path):
    """Download video using free SOCKS5 proxy"""
    import subprocess

    # Try direct first
    try:
        r = subprocess.run([
            "/opt/data/.local/bin/yt-dlp",
            "-f", "bestvideo[height<=1080]+bestaudio/best[height<=1080]/best",
            "--merge-output-format", "mp4",
            "-o", output_path,
            f"https://www.youtube.com/watch?v={video_id}"
        ], capture_output=True, text=True, timeout=300)
        import os
        if os.path.exists(output_path) and os.path.getsize(output_path) > 1000:
            return True
    except:
        pass

    # Try with SOCKS5 proxies
    try:
        resp = requests.get(
            "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks5&timeout=10000&country=all&ssl=all&anonymity=all",
            timeout=10
        )
        socks_proxies = [p.strip() for p in resp.text.strip().split("\n") if p.strip()]

        for proxy in socks_proxies[:10]:
            try:
                r = subprocess.run([
                    "/opt/data/.local/bin/yt-dlp",
                    "--proxy", f"socks5://{proxy}",
                    "-f", "bestvideo[height<=1080]+bestaudio/best[height<=1080]/best",
                    "--merge-output-format", "mp4",
                    "-o", output_path,
                    f"https://www.youtube.com/watch?v={video_id}"
                ], capture_output=True, text=True, timeout=300)
                import os
                if os.path.exists(output_path) and os.path.getsize(output_path) > 1000:
                    print(f"Downloaded with proxy {proxy}", file=sys.stderr)
                    return True
            except:
                continue
    except:
        pass

    return False

def format_transcript(segments):
    """Format segments as readable text with timestamps"""
    lines = []
    for s in segments:
        start_m = int(s["start"] // 60)
        start_s = int(s["start"] % 60)
        lines.append(f"[{start_m}:{start_s:02d}] {s['text']}")
    return "\n".join(lines)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: youtube_fetch.py <video_id> [action] [lang]", file=sys.stderr)
        print("Actions: transcript (default), info, download <output_path>", file=sys.stderr)
        sys.exit(1)

    video_id = sys.argv[1]
    action = sys.argv[2] if len(sys.argv) > 2 else "transcript"
    lang = sys.argv[3] if len(sys.argv) > 3 else "en"

    if action == "transcript":
        segments = fetch_transcript(video_id, lang)
        if segments:
            # Output as JSON to stdout
            print(json.dumps(segments))
        else:
            print("Failed to fetch transcript", file=sys.stderr)
            sys.exit(1)
    elif action == "info":
        title, duration = fetch_video_info(video_id)
        print(json.dumps({"title": title, "duration": duration}))
    elif action == "download":
        output_path = sys.argv[3] if len(sys.argv) > 3 else f"/tmp/{video_id}.mp4"
        success = download_video(video_id, output_path)
        if success:
            import os
            print(json.dumps({"success": True, "path": output_path, "size": os.path.getsize(output_path)}))
        else:
            print(json.dumps({"success": False}))
            sys.exit(1)