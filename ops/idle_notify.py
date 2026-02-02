#!/usr/bin/env python3
import json
import os
import subprocess
import time
from glob import glob
from datetime import datetime, timezone

OWNER = os.environ.get("IDLE_NOTIFY_TO", "+12508697880")
IDLE_MINUTES = int(os.environ.get("IDLE_NOTIFY_MINUTES", "15"))
CHECK_EVERY_SECONDS = int(os.environ.get("IDLE_NOTIFY_CHECK_EVERY_SECONDS", "300"))
STATE_PATH = os.path.expanduser(os.environ.get(
    "IDLE_NOTIFY_STATE",
    "~/Library/Application Support/mission-control/idle-notify.json"
))
LOG_GLOB = os.path.expanduser(os.environ.get(
  "IDLE_NOTIFY_LOG_GLOB",
  "/tmp/openclaw/openclaw-*.log"
))

# These log events are noisy and can occur even when the assistant is effectively idle.
NOISE_SUBSTRINGS = [
  "[tools] browser failed",
  "plugin CLI register skipped",
]


def parse_iso(ts: str):
  try:
    # ex: 2026-02-02T08:08:11.644Z
    if ts.endswith('Z'):
      ts = ts[:-1] + '+00:00'
    return datetime.fromisoformat(ts).astimezone(timezone.utc).timestamp()
  except Exception:
    return None


def last_meaningful_activity_ts(log_path: str):
  """Return unix-ts of last meaningful OpenClaw activity based on JSONL log contents."""
  try:
    # Read last chunk only.
    with open(log_path, 'rb') as f:
      f.seek(0, os.SEEK_END)
      size = f.tell()
      f.seek(max(0, size - 250_000), os.SEEK_SET)
      data = f.read().decode('utf-8', errors='ignore')
  except Exception:
    return None

  lines = [ln for ln in data.splitlines() if ln.strip().startswith('{')]
  # Iterate backwards
  for ln in reversed(lines[-2000:]):
    try:
      obj = json.loads(ln)
    except Exception:
      continue

    msg = str(obj.get('0', '') or '')
    ts = obj.get('time') or obj.get('date')
    tsv = parse_iso(ts) if isinstance(ts, str) else None

    if not tsv:
      continue

    # Ignore known-noise events
    if any(s in msg for s in NOISE_SUBSTRINGS):
      continue

    # Treat any tools/exec/session activity as meaningful.
    # These show up in the "0" message frequently.
    if ('[tools]' in msg) or ('Exec ' in msg) or ('sessions_' in msg) or ('docker' in msg):
      return tsv

    # Otherwise fall back: any INFO/ERROR line counts as activity.
    return tsv

  return None


def latest_log_path():
  paths = glob(LOG_GLOB)
  if not paths:
    return None
  return max(paths, key=lambda p: os.path.getmtime(p))


def load_state():
  try:
    with open(STATE_PATH, "r") as f:
      return json.load(f)
  except Exception:
    return {
      "lastNotifiedAt": 0,
      "lastNotifiedLogMtime": 0,
      "lastSeenLogMtime": 0,
    }


def save_state(st):
  os.makedirs(os.path.dirname(STATE_PATH), exist_ok=True)
  tmp = STATE_PATH + ".tmp"
  with open(tmp, "w") as f:
    json.dump(st, f)
  os.replace(tmp, STATE_PATH)


def send_imessage(text: str):
  # Uses the same imsg CLI OpenClaw is configured with.
  subprocess.run([
    "imsg", "send",
    "--to", OWNER,
    "--text", text,
    "--service", "imessage",
  ], check=False)


def main():
  lp = latest_log_path()
  st = load_state()
  now = time.time()

  if not lp:
    # Nothing to base on; do nothing.
    return

  # Instead of using file mtime (which can change due to noisy background logs),
  # parse the log and find the last meaningful activity timestamp.
  last_ts = last_meaningful_activity_ts(lp)
  if not last_ts:
    # Fallback to mtime
    last_ts = os.path.getmtime(lp)

  # Track last seen meaningful activity.
  if last_ts > st.get("lastSeenLogMtime", 0):
    st["lastSeenLogMtime"] = last_ts
    save_state(st)
    return

  idle_seconds = now - last_ts
  idle_threshold = IDLE_MINUTES * 60

  # Notify once per idle period (per log mtime).
  if idle_seconds >= idle_threshold and st.get("lastNotifiedLogMtime", 0) != last_ts:
    mins = int(idle_seconds // 60)
    send_imessage(f"coco is idle (no OpenClaw activity for ~{mins} minutes). Ping me when you want me to continue.")
    st["lastNotifiedAt"] = now
    st["lastNotifiedLogMtime"] = last_ts
    save_state(st)


if __name__ == "__main__":
  main()
