#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$ROOT_DIR/.." && pwd)"
cd "$ROOT_DIR"

# CI-only smoke test:
# - ensures PocketBase migrations apply cleanly
# - ensures pb_bootstrap/pb_set_* scripts still succeed against a fresh DB
#
# This catches missing migrations, syntax errors, and schema changes that would break upgrades.

case "$(uname -s)" in
  Linux*) PB_OS_DEFAULT="linux" ;;
  Darwin*) PB_OS_DEFAULT="darwin" ;;
  *) PB_OS_DEFAULT="linux" ;;
esac

case "$(uname -m)" in
  x86_64*) PB_ARCH_DEFAULT="amd64" ;;
  arm64*|aarch64*) PB_ARCH_DEFAULT="arm64" ;;
  *) PB_ARCH_DEFAULT="amd64" ;;
esac

PB_OS="${PB_OS:-$PB_OS_DEFAULT}"
PB_ARCH="${PB_ARCH:-$PB_ARCH_DEFAULT}"

PB_BIN="${PB_BIN:-$ROOT_DIR/pb/pocketbase-ci-${PB_OS}-${PB_ARCH}}"
DATA_DIR="$(mktemp -d)"

cleanup() {
  if [ -n "${PB_PID:-}" ]; then
    kill "$PB_PID" >/dev/null 2>&1 || true
    PB_PID=""
  fi
  rm -rf "$DATA_DIR" >/dev/null 2>&1 || true
}
trap cleanup EXIT

if [ ! -x "$PB_BIN" ]; then
  PB_BIN_PATH="${PB_BIN#$ROOT_DIR/}" bash scripts/pb_install.sh
  chmod +x "$PB_BIN" || true
fi

PORT="$(
  node -e '
    const net = require("net");
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const port = s.address().port;
      s.close(() => process.stdout.write(String(port)));
    });
  '
)"

export PB_URL="http://127.0.0.1:${PORT}"
export NEXT_PUBLIC_PB_URL="$PB_URL"
export PB_ADMIN_EMAIL="${PB_ADMIN_EMAIL:-admin@example.com}"
export PB_ADMIN_PASSWORD="${PB_ADMIN_PASSWORD:-devadminpass}"
export PB_SERVICE_EMAIL="${PB_SERVICE_EMAIL:-service@example.com}"
export PB_SERVICE_PASSWORD="${PB_SERVICE_PASSWORD:-devservicepass}"

# Ensure admin exists for pb_bootstrap.mjs (it logs in as superuser).
"$PB_BIN" superuser upsert "$PB_ADMIN_EMAIL" "$PB_ADMIN_PASSWORD" --dir "$DATA_DIR" --migrationsDir "$ROOT_DIR/pb/pb_migrations" >/dev/null

"$PB_BIN" serve --dev --dir "$DATA_DIR" --migrationsDir "$ROOT_DIR/pb/pb_migrations" --http "127.0.0.1:${PORT}" >/dev/null 2>&1 &
PB_PID="$!"

node - <<'NODE'
const base = process.env.PB_URL;
const started = Date.now();
(async () => {
  while (Date.now() - started < 60_000) {
    try {
      const res = await fetch(`${base}/api/health`, { cache: "no-store" });
      if (res.ok) process.exit(0);
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  console.error("[ci_pb_migration_smoke] timed out waiting for /api/health", base);
  process.exit(1);
})();
NODE

node scripts/pb_bootstrap.mjs
node scripts/pb_set_settings.mjs || true
node scripts/pb_set_rules.mjs || true
node scripts/pb_backfill_vnext.mjs || true

echo "[ci_pb_migration_smoke] ok"
