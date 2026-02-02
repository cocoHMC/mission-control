#!/usr/bin/env bash
set -euo pipefail

OUT="$(/Users/coco/mission-control/ops/proof_of_work.sh)"

# Collapse to a single line for iMessage reliability.
ONE_LINE=$(echo "$OUT" | tr '\n' ' ' | sed 's/  */ /g' | sed 's/^ *//; s/ *$//')

echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] ${ONE_LINE}" >> /tmp/openclaw/missioncontrol-proof.out.log

# Send via local iMessage CLI (no AI tokens)
imsg send --to +12508697880 --text "${ONE_LINE}" --service imessage >/dev/null 2>&1 || true
