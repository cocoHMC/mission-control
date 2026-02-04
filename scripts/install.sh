#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example"
fi

pnpm install

if [ "${SKIP_PB_INSTALL:-0}" != "1" ]; then
  if ! bash ./scripts/pb_install.sh; then
    echo "" >&2
    echo "WARNING: PocketBase install failed." >&2
    echo "You can:" >&2
    echo "  1) Install PocketBase manually into pb/pocketbase, or" >&2
    echo "  2) Run PocketBase via Docker: docker compose up -d pb" >&2
  fi
fi

echo "Install complete."
echo "Next: ./scripts/run.sh (then open http://127.0.0.1:4010/setup)"
