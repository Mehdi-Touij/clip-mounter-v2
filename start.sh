#!/bin/sh
# Collapsed single-machine startup: supervise the worker (restart on crash)
# and run the Next.js server as the main foreground process.
set -eu

TSX="./node_modules/.bin/tsx"

(
  while true; do
    echo "[start] launching worker..."
    "$TSX" worker/index.ts || echo "[start] worker exited ($?) — restarting in 3s"
    sleep 3
  done
) &

echo "[start] worker supervisor started (pid $!)"
exec pnpm start
