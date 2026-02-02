#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

STAMP=$(date +%Y%m%d-%H%M%S)
DEST="$ROOT_DIR/backups/$STAMP"
mkdir -p "$DEST"

rsync -a --delete "$ROOT_DIR/pb/pb_data/" "$DEST/pb_data/"

echo "Backup saved to $DEST"
