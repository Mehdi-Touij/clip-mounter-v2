# Single image runs BOTH the Next.js web app and the worker (see start.sh).
# Debian (not alpine): friendlier for better-sqlite3 native builds + yt-dlp.
FROM node:22-bookworm-slim

# System deps: ffmpeg (render), python3+pip (yt-dlp / transcript), build tools (better-sqlite3).
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg python3 python3-pip ca-certificates build-essential \
    && rm -rf /var/lib/apt/lists/*

# yt-dlp + youtube-transcript-api, system-wide. Keep yt-dlp fresh at build time.
RUN pip3 install --no-cache-dir --break-system-packages -U yt-dlp youtube-transcript-api

WORKDIR /app
RUN npm install -g pnpm@10

# Install ALL deps (build needs devDeps). NODE_ENV stays unset here on purpose.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build && chmod +x start.sh

# Persistent data (SQLite + videos + outputs + tmp) lives on a mounted volume.
ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 3000

CMD ["./start.sh"]
