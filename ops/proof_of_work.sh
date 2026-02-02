#!/usr/bin/env bash
set -euo pipefail

cd /Users/coco/mission-control

TS="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
DEV_URL="http://100.64.0.2:4011/tasks"

STATUS="$(git status --porcelain || true)"
DIFFSTAT="$(git diff --stat || true)"
LAST_TOUCH="$(find apps scripts ops -type f -not -path '*/node_modules/*' -not -path '*/.next/*' -not -path '*/pb_data/*' -print0 2>/dev/null | xargs -0 stat -f '%m %N' 2>/dev/null | sort -nr | head -n 1 | awk '{print $1}')"
LAST_TOUCH_HUMAN=""
if [ -n "${LAST_TOUCH}" ]; then
  LAST_TOUCH_HUMAN="$(python3 - <<PY
import datetime
ts=int(${LAST_TOUCH})
print(datetime.datetime.utcfromtimestamp(ts).strftime('%Y-%m-%dT%H:%M:%SZ'))
PY
)"
fi

SUMMARY=""
if [ -f docs/BUILD_STATUS.json ]; then
  SUMMARY="$(python3 - <<'PY'
import json
try:
  d=json.load(open('docs/BUILD_STATUS.json'))
  print(d.get('lastSummary',''))
except Exception:
  print('')
PY
)"
fi

HUMAN=""
if [ -n "${LAST_TOUCH_HUMAN:-}" ]; then
  HUMAN="still building: YES"
fi

{
  echo
  echo "## ${TS}"
  echo "- url: DEV=${DEV_URL}"
  echo "- last_code_change_utc: ${LAST_TOUCH_HUMAN:-unknown}"
  echo "- summary: ${SUMMARY:-<none>}"
  echo "- git status (porcelain):"
  echo
  echo "\`\`\`"
  echo "${STATUS:-<empty>}"
  echo "\`\`\`"
  echo
  echo "\`\`\`"
  echo "${DIFFSTAT:-<no diff>}"
  echo "\`\`\`"
} >> docs/PROGRESS.log

# Print a short single-line summary for messaging
if [ -z "${STATUS:-}" ] && [ -z "${DIFFSTAT:-}" ]; then
  echo "${TS} — no git changes detected. DEV=${DEV_URL} last_change=${LAST_TOUCH_HUMAN:-unknown}. ${SUMMARY:-}"
else
  ONE_STATUS=$(echo "${STATUS:-}" | tr '\n' ';' | sed 's/;*$//')
  ONE_DIFF=$(echo "${DIFFSTAT:-}" | tr '\n' ';' | sed 's/;*$//')
  echo "${TS} — status: ${ONE_STATUS:-<none>}; diff: ${ONE_DIFF:-<none>}. DEV=${DEV_URL} last_change=${LAST_TOUCH_HUMAN:-unknown}. ${SUMMARY:-}"
fi
