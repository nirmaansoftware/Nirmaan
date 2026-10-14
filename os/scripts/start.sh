#!/bin/sh
# Server start (Dockerfile.os): database migrations, then the web app and the
# campaign worker side by side. If either stops, the script exits and Fly
# restarts the machine, so the worker can't silently die while the site stays up.
set -e
mkdir -p /data/projects
npx prisma migrate deploy

npm run campaigns:worker &
WORKER=$!
npx next start -p "${PORT:-3000}" &
WEB=$!

trap 'kill $WORKER $WEB 2>/dev/null; exit 0' TERM INT
while kill -0 "$WORKER" 2>/dev/null && kill -0 "$WEB" 2>/dev/null; do
  sleep 5
done
echo "A process stopped; exiting so the machine restarts." >&2
kill $WORKER $WEB 2>/dev/null || true
exit 1
