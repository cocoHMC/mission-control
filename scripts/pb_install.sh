#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PB_VERSION="${PB_VERSION:-0.36.2}"
# Optional overrides (useful for CI cross-builds).
PB_OS_OVERRIDE="${PB_OS:-}"
PB_ARCH_OVERRIDE="${PB_ARCH:-}"
PB_BIN_PATH_OVERRIDE="${PB_BIN_PATH:-}"
PB_DIR="$ROOT_DIR/pb"

uname_s="$(uname -s | tr '[:upper:]' '[:lower:]')"
uname_m="$(uname -m | tr '[:upper:]' '[:lower:]')"

case "$uname_s" in
  darwin*) os="darwin" ;;
  linux*) os="linux" ;;
  msys*|mingw*|cygwin*) os="windows" ;;
  *) echo "Unsupported OS: $uname_s" >&2; exit 1 ;;
esac

case "$uname_m" in
  x86_64|amd64) arch="amd64" ;;
  arm64|aarch64) arch="arm64" ;;
  *) echo "Unsupported CPU arch: $uname_m" >&2; exit 1 ;;
esac

if [ -n "$PB_OS_OVERRIDE" ]; then
  os="$PB_OS_OVERRIDE"
fi

if [ -n "$PB_ARCH_OVERRIDE" ]; then
  arch="$PB_ARCH_OVERRIDE"
fi

case "$os" in
  darwin|linux|windows) ;;
  *) echo "Unsupported PB_OS: $os (expected darwin|linux|windows)" >&2; exit 1 ;;
esac

case "$arch" in
  amd64|arm64) ;;
  *) echo "Unsupported PB_ARCH: $arch (expected amd64|arm64)" >&2; exit 1 ;;
esac

if [ "$os" = "windows" ]; then
  PB_BIN="$PB_DIR/pocketbase.exe"
else
  PB_BIN="$PB_DIR/pocketbase"
fi

if [ -n "$PB_BIN_PATH_OVERRIDE" ]; then
  PB_BIN="$ROOT_DIR/$PB_BIN_PATH_OVERRIDE"
fi

if [ -x "$PB_BIN" ]; then
  if "$PB_BIN" --version >/dev/null 2>&1; then
    echo "PocketBase already installed at $PB_BIN"
    exit 0
  fi
fi

mkdir -p "$PB_DIR"

asset="pocketbase_${PB_VERSION}_${os}_${arch}.zip"
url="https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/${asset}"

tmp="$(mktemp -d)"
cleanup() { rm -rf "$tmp" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "Downloading PocketBase ${PB_VERSION} (${os}/${arch})..."
curl -fsSL "$url" -o "$tmp/pb.zip"
unzip -q "$tmp/pb.zip" -d "$tmp/unzip"

if [ "$os" = "windows" ]; then
  if [ ! -f "$tmp/unzip/pocketbase.exe" ]; then
    echo "PocketBase archive missing pocketbase.exe" >&2
    exit 1
  fi
  mv -f "$tmp/unzip/pocketbase.exe" "$PB_BIN"
else
  if [ ! -f "$tmp/unzip/pocketbase" ]; then
    echo "PocketBase archive missing pocketbase" >&2
    exit 1
  fi
  mv -f "$tmp/unzip/pocketbase" "$PB_BIN"
  chmod +x "$PB_BIN"
fi

echo "Installed PocketBase at $PB_BIN"
"$PB_BIN" --version
