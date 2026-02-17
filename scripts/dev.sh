#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

RESTART_EXIT_CODE="${MC_RESTART_EXIT_CODE:-42}"

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example (first-run defaults)"
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
  if bash ./scripts/pb_install.sh; then
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

cap_log_file() {
  local path="$1"
  local max_bytes="${2:-2147483648}"  # 2 GiB
  local keep_bytes="${3:-268435456}"  # 256 MiB

  [ -f "$path" ] || return 0

  local size=""
  size="$(stat -f%z "$path" 2>/dev/null || true)"
  if [ -z "$size" ]; then
    size="$(wc -c <"$path" 2>/dev/null || echo 0)"
  fi

  # If the log exceeds max_bytes, keep only the last keep_bytes.
  if [ "$size" -gt "$max_bytes" ]; then
    tail -c "$keep_bytes" "$path" > "${path}.tmp" 2>/dev/null || true
    if [ -s "${path}.tmp" ]; then
      mv "${path}.tmp" "$path"
    else
      rm -f "${path}.tmp" 2>/dev/null || true
      : > "$path"
    fi
  fi
}

start_log_capper() {
  local path="$1"
  local max_bytes="$2"
  local keep_bytes="$3"

  # Important: this must run in the *current* shell so callers can background it
  # and capture `$!`. Using command substitution like `pid="$(start_log_capper ...)"`
  # runs the function in a subshell, and background jobs can cause the subshell to
  # hang forever on macOS (bash 3.2). Keep this foreground-only.
  set +e
  while true; do
    cap_log_file "$path" "$max_bytes" "$keep_bytes"
    sleep 10
  done
}

PB_HTTP="$("$DOTENV_BIN" -e "$ROOT_DIR/.env" -- node -e '
try {
  const raw = String(process.env.PB_URL || "").trim() || "http://127.0.0.1:8090";
  const u = new URL(raw);
  const port = u.port ? u.port : "8090";
  const host = u.hostname || "127.0.0.1";
  console.log(`${host}:${port}`);
} catch {
  console.log("127.0.0.1:8090");
}
')"

PB_URL="$("$DOTENV_BIN" -e "$ROOT_DIR/.env" -- node -e '
try {
  const raw = String(process.env.PB_URL || "").trim() || "http://127.0.0.1:8090";
  const u = new URL(raw);
  console.log(u.toString());
} catch {
  console.log("http://127.0.0.1:8090");
}
')"

pb_is_up() {
  "$DOTENV_BIN" -e "$ROOT_DIR/.env" -- node -e '
  (async () => {
    try {
      const raw = String(process.env.PB_URL || "").trim() || "http://127.0.0.1:8090";
      const u = new URL(raw);
      const res = await fetch(new URL("/api/health", u.toString()), { cache: "no-store" });
      process.exit(res.ok ? 0 : 1);
    } catch {
      process.exit(1);
    }
  })();
  ' >/dev/null 2>&1
}

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
  if [ -n "${PB_LOG_CAPPER_PID:-}" ]; then
    kill "$PB_LOG_CAPPER_PID" >/dev/null 2>&1 || true
    PB_LOG_CAPPER_PID=""
  fi
}

trap 'stop_children; exit 0' INT TERM
trap 'stop_children' EXIT

while true; do
  WEB_PID=""
  WORKER_PID=""
  PB_PID=""
  PB_LOG_CAPPER_PID=""

  if pb_is_up; then
    echo "[mission-control] PocketBase already running at $PB_URL (reusing)"
  else
    PB_LOG="$ROOT_DIR/pb/pocketbase.log"
    PB_LOG_MAX_BYTES="${MC_PB_LOG_MAX_BYTES:-2147483648}"   # 2 GiB
    PB_LOG_KEEP_BYTES="${MC_PB_LOG_KEEP_BYTES:-268435456}"  # 256 MiB
    cap_log_file "$PB_LOG" "$PB_LOG_MAX_BYTES" "$PB_LOG_KEEP_BYTES"

    "$PB_BIN" serve --dev --dir "$ROOT_DIR/pb/pb_data" --migrationsDir "$ROOT_DIR/pb/pb_migrations" --http "$PB_HTTP" > "$PB_LOG" 2>&1 &
    PB_PID=$!
    start_log_capper "$PB_LOG" "$PB_LOG_MAX_BYTES" "$PB_LOG_KEEP_BYTES" &
    PB_LOG_CAPPER_PID=$!
    sleep 1
  fi

  NEEDS_SETUP="$("$DOTENV_BIN" -e "$ROOT_DIR/.env" -- node -e '
const bad=(v)=>!v||String(v).trim().toLowerCase()==="change-me"||String(v).trim().toLowerCase()==="changeme";
const needs = bad(process.env.MC_ADMIN_PASSWORD) || bad(process.env.PB_ADMIN_PASSWORD) || bad(process.env.PB_SERVICE_PASSWORD);
console.log(needs ? "1" : "0");
')"

  if [ "$NEEDS_SETUP" = "1" ]; then
    echo "Setup required. Open: http://127.0.0.1:${MC_WEB_PORT:-4010}/setup"
  else
    "$DOTENV_BIN" -e "$ROOT_DIR/.env" -- node "$ROOT_DIR/scripts/pb_bootstrap.mjs"
    "$DOTENV_BIN" -e "$ROOT_DIR/.env" -- node "$ROOT_DIR/scripts/pb_set_settings.mjs" || true
    "$DOTENV_BIN" -e "$ROOT_DIR/.env" -- node "$ROOT_DIR/scripts/pb_set_rules.mjs" || true
    "$DOTENV_BIN" -e "$ROOT_DIR/.env" -- node "$ROOT_DIR/scripts/pb_backfill_vnext.mjs" || true
  fi

  if [ "$NEEDS_SETUP" != "1" ]; then
    ("$DOTENV_BIN" -e "$ROOT_DIR/.env" -- pnpm -C apps/worker dev) > "$ROOT_DIR/apps/worker/dev.log" 2>&1 &
    WORKER_PID=$!
  fi

  "$DOTENV_BIN" -e "$ROOT_DIR/.env" -- sh -c 'export MC_AUTO_RESTART=1; exec pnpm -C apps/web exec next dev --webpack -H "${MC_BIND_HOST:-127.0.0.1}" -p "${MC_WEB_PORT:-4010}"' &
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
