#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

TS="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="$ROOT_DIR/backups/dev-reset-$TS"
mkdir -p "$BACKUP_DIR"

if [ -f "$ROOT_DIR/.env" ]; then
  mv "$ROOT_DIR/.env" "$BACKUP_DIR/.env"
  echo "Moved .env -> $BACKUP_DIR/.env"
fi

if [ -d "$ROOT_DIR/pb/pb_data" ]; then
  mv "$ROOT_DIR/pb/pb_data" "$BACKUP_DIR/pb_data"
  mkdir -p "$ROOT_DIR/pb/pb_data"
  echo "Moved pb/pb_data -> $BACKUP_DIR/pb_data"
fi

if [ -f "$ROOT_DIR/pb/pocketbase.log" ]; then
  mv "$ROOT_DIR/pb/pocketbase.log" "$BACKUP_DIR/pocketbase.log"
  echo "Moved pb/pocketbase.log -> $BACKUP_DIR/pocketbase.log"
fi

if [ -f "$ROOT_DIR/apps/worker/dev.log" ]; then
  mv "$ROOT_DIR/apps/worker/dev.log" "$BACKUP_DIR/worker.dev.log"
  echo "Moved apps/worker/dev.log -> $BACKUP_DIR/worker.dev.log"
fi

echo ""
echo "Reset complete."
echo "Next:"
echo "  1) ./scripts/install.sh"
echo "  2) ./scripts/run.sh"
echo "  3) Open http://127.0.0.1:4010/setup"
