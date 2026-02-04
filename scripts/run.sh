#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Developer convenience: `./scripts/run.sh --dev`
if [[ "${1:-}" == "--dev" ]]; then
  exec "$ROOT_DIR/scripts/dev.sh"
fi

DATA_DIR="${MC_DATA_DIR:-$ROOT_DIR}"
ENV_PATH="$DATA_DIR/.env"
RESTART_EXIT_CODE="${MC_RESTART_EXIT_CODE:-42}"

mkdir -p "$DATA_DIR/pb"

if [ ! -f "$ENV_PATH" ]; then
  cp "$ROOT_DIR/.env.example" "$ENV_PATH"
  echo "Created $ENV_PATH from .env.example (first-run defaults)"
fi

DOTENV_BIN="$ROOT_DIR/node_modules/.bin/dotenv"
if [ ! -x "$DOTENV_BIN" ]; then
  echo "dotenv-cli missing. Run scripts/install.sh first." >&2
  exit 1
fi

PB_BIN="$ROOT_DIR/pb/pocketbase"
if [ ! -x "$PB_BIN" ]; then
  echo "PocketBase binary missing (or not executable) at $PB_BIN" >&2
  echo "Attempting automatic install..." >&2
  if bash "$ROOT_DIR/scripts/pb_install.sh"; then
    echo "PocketBase installed." >&2
  else
    echo "" >&2
    echo "PocketBase install failed." >&2
    echo "Options:" >&2
    echo "  1) Download PocketBase for your OS/arch and place it at pb/pocketbase" >&2
    echo "  2) Use Docker (recommended on Windows): docker compose up -d pb" >&2
    exit 1
  fi
fi

stop_children() {
  if [ -n "${WEB_PID:-}" ]; then
    kill "$WEB_PID" >/dev/null 2>&1 || true
    WEB_PID=""
  fi
  if [ -n "${WORKER_PID:-}" ]; then
    kill "$WORKER_PID" >/dev/null 2>&1 || true
    WORKER_PID=""
  fi
  if [ -n "${PB_PID:-}" ]; then
    kill "$PB_PID" >/dev/null 2>&1 || true
    PB_PID=""
  fi
}

trap 'stop_children; exit 0' INT TERM
trap 'stop_children' EXIT

while true; do
  WEB_PID=""
  WORKER_PID=""
  PB_PID=""

  PB_DATA_DIR="$DATA_DIR/pb/pb_data"
  PB_LOG="$DATA_DIR/pb/pocketbase.log"
  mkdir -p "$PB_DATA_DIR"

  # Start PocketBase (production mode).
  "$PB_BIN" serve --dir "$PB_DATA_DIR" --migrationsDir "$ROOT_DIR/pb/pb_migrations" > "$PB_LOG" 2>&1 &
  PB_PID=$!

  sleep 1

  # Ensure app build exists (required for /setup as well).
  if [ ! -f "$ROOT_DIR/apps/web/.next/BUILD_ID" ]; then
    echo "[mission-control] building web + worker..."
    "$DOTENV_BIN" -e "$ENV_PATH" -- pnpm -r build
  fi

  NEEDS_SETUP="$("$DOTENV_BIN" -e "$ENV_PATH" -- node -e '
const bad=(v)=>!v||String(v).trim().toLowerCase()==="change-me"||String(v).trim().toLowerCase()==="changeme";
const needs = bad(process.env.MC_ADMIN_PASSWORD) || bad(process.env.PB_ADMIN_PASSWORD) || bad(process.env.PB_SERVICE_PASSWORD);
console.log(needs ? "1" : "0");
')"

  if [ "$NEEDS_SETUP" = "1" ]; then
    echo "Setup required. Open: http://127.0.0.1:${MC_WEB_PORT:-4010}/setup"
  else
    "$DOTENV_BIN" -e "$ENV_PATH" -- node "$ROOT_DIR/scripts/pb_bootstrap.mjs" || true
    "$DOTENV_BIN" -e "$ENV_PATH" -- node "$ROOT_DIR/scripts/pb_set_rules.mjs" || true
    "$DOTENV_BIN" -e "$ENV_PATH" -- node "$ROOT_DIR/scripts/pb_backfill_vnext.mjs" || true
  fi

  if [ "$NEEDS_SETUP" != "1" ]; then
    ("$DOTENV_BIN" -e "$ENV_PATH" -- pnpm -C apps/worker start) > "$DATA_DIR/worker.log" 2>&1 &
    WORKER_PID=$!
  fi

  # Start Next.js in production mode.
  "$DOTENV_BIN" -e "$ENV_PATH" -- sh -c '
    export MC_APP_DIR="'"$ROOT_DIR"'";
    export MC_DATA_DIR="'"$DATA_DIR"'";
    export MC_AUTO_RESTART=1;
    exec pnpm -C apps/web start -H "${MC_BIND_HOST:-127.0.0.1}" -p "${MC_WEB_PORT:-4010}"
  ' &
  WEB_PID=$!

  set +e
  wait "$WEB_PID"
  WEB_EXIT=$?
  set -e
  WEB_PID=""

  stop_children

  if [ "$WEB_EXIT" -eq "$RESTART_EXIT_CODE" ]; then
    echo "[mission-control] restart requested; restarting..."
    sleep 1
    continue
  fi

  exit "$WEB_EXIT"
done

