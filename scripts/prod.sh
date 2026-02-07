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

"$DOTENV_BIN" -e "$ROOT_DIR/.env" -- pnpm build

cat <<'MSG'
Build complete.

For macOS production:
- Use launchd or a supervisor to run:
  - pb/pocketbase serve --dir pb/pb_data --migrationsDir pb/pb_migrations
  - (Next standalone) PORT=$MC_WEB_PORT HOSTNAME=$MC_BIND_HOST node apps/web/.next/standalone/apps/web/server.js
  - pnpm -C apps/worker start (or pnpm -C apps/worker dev in dev-only)

See docs/RUNBOOK.md for launchd examples.
MSG
