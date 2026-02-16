#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

set -a
source .env
set +a

WEB_URL="http://${MC_BIND_HOST:-127.0.0.1}:${MC_WEB_PORT:-4010}/api/health"
WEB_BASE="http://${MC_BIND_HOST:-127.0.0.1}:${MC_WEB_PORT:-4010}"
PB_URL="${PB_URL:-http://127.0.0.1:8090}/api/health"

curl -fsS "$PB_URL" > /dev/null && echo "PocketBase OK"
curl -fsS "$WEB_URL" > /dev/null && echo "Web OK"

if [ "${MC_HEALTHCHECK_PING:-false}" = "true" ]; then
  node "$ROOT_DIR/scripts/openclaw_ping.mjs" >/dev/null && echo "OpenClaw tools/invoke OK"
fi

if [ "${MC_HEALTHCHECK_OPENCLAW_TEST:-false}" = "true" ]; then
  if [ -z "${MC_ADMIN_USER:-}" ] || [ -z "${MC_ADMIN_PASSWORD:-}" ]; then
    echo "MC_HEALTHCHECK_OPENCLAW_TEST=true requires MC_ADMIN_USER and MC_ADMIN_PASSWORD" >&2
    exit 1
  fi

  OPENCLAW_TEST_JSON="$(curl -fsS \
    -u "${MC_ADMIN_USER}:${MC_ADMIN_PASSWORD}" \
    -H 'content-type: application/json' \
    -d '{}' \
    "${WEB_BASE}/api/openclaw/test")"

  echo "$OPENCLAW_TEST_JSON" | grep -q '"ok":true'
  echo "$OPENCLAW_TEST_JSON" | grep -q '"deliveryProbe"'
  echo "OpenClaw API delivery probe OK"
fi
