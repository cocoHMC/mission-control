#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILL_NAME="mission-control-setup"
SRC_DIR="$ROOT_DIR/skills/$SKILL_NAME"

if [ ! -f "$SRC_DIR/SKILL.md" ]; then
  echo "Missing skill at: $SRC_DIR/SKILL.md" >&2
  exit 1
fi

CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
DEST_ROOT="$CODEX_HOME/skills"
DEST_DIR="$DEST_ROOT/$SKILL_NAME"

mkdir -p "$DEST_ROOT"

if [ -d "$DEST_DIR" ]; then
  TS="$(date +%Y%m%d-%H%M%S)"
  BACKUP_DIR="${DEST_DIR}.bak-${TS}"
  mv "$DEST_DIR" "$BACKUP_DIR"
  echo "Backed up existing skill to: $BACKUP_DIR"
fi

cp -R "$SRC_DIR" "$DEST_DIR"

echo "Installed skill to: $DEST_DIR"
echo "Next: restart Codex (if open) and use the \"$SKILL_NAME\" skill."

