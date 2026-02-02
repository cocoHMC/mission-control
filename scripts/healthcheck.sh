#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

set -a
source .env
set +a

WEB_URL="http://${MC_BIND_HOST:-127.0.0.1}:${MC_WEB_PORT:-4010}/api/health"
PB_URL="${PB_URL:-http://127.0.0.1:8090}/api/health"

curl -fsS "$PB_URL" > /dev/null && echo "PocketBase OK"
curl -fsS "$WEB_URL" > /dev/null && echo "Web OK"
