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
}

trap 'stop_children; exit 0' INT TERM
trap 'stop_children' EXIT

while true; do
  WEB_PID=""
  WORKER_PID=""
  PB_PID=""

  if pb_is_up; then
    echo "[mission-control] PocketBase already running at $PB_URL (reusing)"
  else
    "$PB_BIN" serve --dev --dir "$ROOT_DIR/pb/pb_data" --migrationsDir "$ROOT_DIR/pb/pb_migrations" --http "$PB_HTTP" > "$ROOT_DIR/pb/pocketbase.log" 2>&1 &
    PB_PID=$!
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
