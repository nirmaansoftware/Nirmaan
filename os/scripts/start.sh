#!/bin/sh
# Server start (Dockerfile.os): database migrations, then the web app and, only when
# NIRMAAN_WORKER is exactly "on", the campaign worker beside it. Unset or any other
# value leaves the worker off (the Gmail poller and sender never start). If a started
# process stops, the script exits and Fly restarts the machine, so the worker can't
# silently die while the site stays up.
set -e
mkdir -p /data/projects
npx prisma migrate deploy

WORKER=""
if [ "${NIRMAAN_WORKER:-}" = "on" ]; then
  npm run campaigns:worker &
  WORKER=$!
else
  echo "NIRMAAN_WORKER is not \"on\": the campaign worker stays off." >&2
fi
npx next start -p "${PORT:-3000}" &
WEB=$!

trap 'kill $WORKER $WEB 2>/dev/null; exit 0' TERM INT
while kill -0 "$WEB" 2>/dev/null && { [ -z "$WORKER" ] || kill -0 "$WORKER" 2>/dev/null; }; do
  sleep 5
done
echo "A process stopped; exiting so the machine restarts." >&2
kill $WORKER $WEB 2>/dev/null || true
exit 1
