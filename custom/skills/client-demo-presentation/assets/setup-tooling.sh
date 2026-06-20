#!/usr/bin/env bash
set -euo pipefail

# Reusable Playwright/FFmpeg tooling setup for the client-demo-presentation skill.
# This avoids re-downloading Chromium for every demo by keeping tooling in a persistent
# cache directory. Safe to run on every invocation — it skips installation if the cache
# is already valid.

CACHE_DIR="${CLIENT_DEMO_CACHE_DIR:-$HOME/.cache/client-demo-presentation}"

ensure_pnpm() {
  if command -v pnpm >/dev/null 2>&1; then
    return 0
  fi
  echo "ERROR: pnpm is required but not found in PATH." >&2
  echo "Install it first: https://pnpm.io/installation" >&2
  exit 1
}

ensure_tooling() {
  if [[ -d "$CACHE_DIR/node_modules/playwright" ]] && compgen -G "$CACHE_DIR/ms-browsers/chromium-*" >/dev/null 2>&1; then
    echo "[client-demo] Reusing cached tooling in $CACHE_DIR"
    return 0
  fi

  echo "[client-demo] Installing Playwright + ffmpeg-static into $CACHE_DIR (one-time)"
  mkdir -p "$CACHE_DIR"
  cd "$CACHE_DIR"

  if [[ ! -f package.json ]]; then
    echo '{"name":"client-demo-tooling","private":true,"type":"module"}' > package.json
  fi

  pnpm add --allow-build ffmpeg-static playwright
  PLAYWRIGHT_BROWSERS_PATH="$CACHE_DIR/ms-browsers" pnpm exec playwright install chromium
}

main() {
  ensure_pnpm
  ensure_tooling
  echo "[client-demo] Cache ready: $CACHE_DIR"
}

main "$@"
