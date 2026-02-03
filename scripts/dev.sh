#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f .env ]; then
  echo ".env missing. Run scripts/install.sh first." >&2
  exit 1
fi

DOTENV_BIN="$ROOT_DIR/node_modules/.bin/dotenv"
if [ ! -x "$DOTENV_BIN" ]; then
  echo "dotenv-cli missing. Run scripts/install.sh first." >&2
  exit 1
fi

PB_BIN="$ROOT_DIR/pb/pocketbase"
if [ ! -x "$PB_BIN" ]; then
  echo "PocketBase binary missing at $PB_BIN" >&2
  echo "Options:" >&2
  echo "  1) Download PocketBase for your OS/arch and place it at pb/pocketbase" >&2
  echo "  2) Use Docker (recommended on Windows): docker compose up -d pb" >&2
  exit 1
fi

"$PB_BIN" serve --dev --dir "$ROOT_DIR/pb/pb_data" --migrationsDir "$ROOT_DIR/pb/pb_migrations" > "$ROOT_DIR/pb/pocketbase.log" 2>&1 &
PB_PID=$!

sleep 1
node "$ROOT_DIR/scripts/pb_bootstrap.mjs"
node "$ROOT_DIR/scripts/pb_set_rules.mjs" || true
node "$ROOT_DIR/scripts/pb_backfill_vnext.mjs" || true

cleanup() {
  kill "$PB_PID" >/dev/null 2>&1 || true
  if [ -n "${WORKER_PID:-}" ]; then
    kill "$WORKER_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

("$DOTENV_BIN" -e "$ROOT_DIR/.env" -- pnpm -C apps/worker dev) > "$ROOT_DIR/apps/worker/dev.log" 2>&1 &
WORKER_PID=$!

exec "$DOTENV_BIN" -e "$ROOT_DIR/.env" -- sh -c 'pnpm -C apps/web exec next dev --webpack -H "${MC_BIND_HOST:-127.0.0.1}" -p "${MC_WEB_PORT:-4010}"'
