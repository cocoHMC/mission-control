#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f .env ]; then
  echo ".env missing. Copy .env.example -> .env and fill values." >&2
  exit 1
fi

node "$ROOT_DIR/scripts/pb_bootstrap.mjs"
node "$ROOT_DIR/scripts/pb_set_rules.mjs" || true
node "$ROOT_DIR/scripts/pb_backfill_vnext.mjs" || true

echo "Bootstrap complete."

