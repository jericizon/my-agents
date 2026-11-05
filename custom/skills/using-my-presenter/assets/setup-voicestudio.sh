#!/usr/bin/env bash
# Install VoiceStudio (github.com/debpalash/VoiceStudio) — the narration engine
# for --voiceover demos. Downloads the latest GitHub-release AppImage on Linux
# x86_64 into ~/.local/bin (overridable via VOICESTUDIO_BIN). Idempotent: when a
# binary is already installed nothing is downloaded.
set -euo pipefail

BIN="${VOICESTUDIO_BIN:-$HOME/.local/bin/VoiceStudio}"
API="${VS_BASE_URL:-http://localhost:3900}"
REPO="debpalash/VoiceStudio"

if curl -sf --max-time 5 "$API/v1/audio/voices" >/dev/null 2>&1; then
  echo "[client-demo] VoiceStudio already serving at $API"
  exit 0
fi
if [[ -x "$BIN" ]]; then
  echo "[client-demo] VoiceStudio already installed at $BIN (not running) — launch it, then poll $API/v1/audio/voices until HTTP 200."
  exit 0
fi

case "$(uname -s)/$(uname -m)" in
  Linux/x86_64) ASSET_RE='-linux-x64\.AppImage$' ;;
  *) echo "ERROR: auto-install supports Linux x86_64 only — install manually from https://github.com/$REPO/releases and place it at $BIN" >&2; exit 1 ;;
esac

echo "[client-demo] Resolving latest VoiceStudio release from github.com/$REPO" >&2
URL=$(curl -sf --max-time 20 "https://api.github.com/repos/$REPO/releases/latest" \
  | grep -oE '"browser_download_url": *"[^"]+"' | cut -d'"' -f4 \
  | grep -E "$ASSET_RE" | head -1)
[[ -n "$URL" ]] || { echo "ERROR: no Linux AppImage asset found in the latest release." >&2; exit 1; }

mkdir -p "$(dirname "$BIN")"
if grep -qiE "microsoft|wsl" /proc/version 2>/dev/null || [[ -n "${WSL_DISTRO_NAME:-}${WSL_INTEROP:-}" ]]; then
  echo "[client-demo] WSL detected: an Electron GUI app needs WSLg here — VoiceStudio on the Windows host works too (the recorder auto-probes the WSL gateway)." >&2
fi
echo "[client-demo] Downloading $URL" >&2
curl -fL --max-time 900 -o "$BIN.part" "$URL"
chmod +x "$BIN.part"
mv "$BIN.part" "$BIN"
echo "[client-demo] Installed: $BIN"
echo "[client-demo] Launch it (first boot downloads its runtime — can take minutes), then poll: curl -sf $API/v1/audio/voices"
