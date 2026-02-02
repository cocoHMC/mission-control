#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f .env ]; then
  echo ".env missing. Run scripts/install.sh first." >&2
  exit 1
fi

set -a
source .env
set +a

PB_BIN="$ROOT_DIR/pb/pocketbase"
if [ ! -x "$PB_BIN" ]; then
  echo "PocketBase binary missing at $PB_BIN" >&2
  exit 1
fi

"$PB_BIN" serve --dev --dir "$ROOT_DIR/pb/pb_data" --migrationsDir "$ROOT_DIR/pb/pb_migrations" > "$ROOT_DIR/pb/pocketbase.log" 2>&1 &
PB_PID=$!

sleep 1
node "$ROOT_DIR/scripts/pb_bootstrap.mjs"
node "$ROOT_DIR/scripts/pb_set_rules.mjs" || true

cleanup() {
  kill "$PB_PID" >/dev/null 2>&1 || true
  if [ -n "${WORKER_PID:-}" ]; then
    kill "$WORKER_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

pnpm -C apps/worker dev > "$ROOT_DIR/apps/worker/dev.log" 2>&1 &
WORKER_PID=$!

pnpm -C apps/web dev -- --hostname "${MC_BIND_HOST}" --port "${MC_WEB_PORT}"
