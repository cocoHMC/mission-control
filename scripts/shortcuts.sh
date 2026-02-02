#!/usr/bin/env bash
set -euo pipefail

CMD=${1:-}
NAME=${2:-}
INPUT=${3:-}

if [ -z "$CMD" ]; then
  echo "Usage: shortcuts.sh list | run <name> [input]" >&2
  exit 1
fi

if [ "$CMD" = "list" ]; then
  shortcuts list
  exit 0
fi

if [ "$CMD" = "run" ]; then
  if [ -z "$NAME" ]; then
    echo "Missing shortcut name" >&2
    exit 1
  fi
  if [ -n "$INPUT" ]; then
    shortcuts run "$NAME" -i "$INPUT"
  else
    shortcuts run "$NAME"
  fi
  exit 0
fi

echo "Unknown command: $CMD" >&2
exit 1
