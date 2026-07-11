#!/bin/sh
# Start the render worker in background + Next.js as main process
npx tsx worker/index.ts &
WORKER_PID=$!
echo "Render worker started (PID: $WORKER_PID)"
exec pnpm start