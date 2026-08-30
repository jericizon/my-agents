#!/usr/bin/env bash
set -euo pipefail

CACHE_DIR="${CLIENT_DEMO_CACHE_DIR:-$HOME/.cache/client-demo-presentation}"
PIPER_DIR="${CLIENT_DEMO_PIPER_DIR:-$CACHE_DIR/piper}"
VOICE_DIR="${DEMO_TTS_DATA_DIR:-$CACHE_DIR/voices}"
VOICE_NAME="${DEMO_TTS_VOICE:-en_US-lessac-high}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
PIPER_VERSION="1.7.0"
PIPER_SITE_DIR="$PIPER_DIR/site-packages"
PIPER_BIN="$PIPER_DIR/bin/piper"
PIPER_VERSION_FILE="$PIPER_DIR/.piper-version"
MODEL_PATH="$VOICE_DIR/$VOICE_NAME.onnx"
CONFIG_PATH="$MODEL_PATH.json"

if [[ ! "$VOICE_NAME" =~ ^[A-Za-z0-9_.-]+$ ]]; then
  echo "ERROR: DEMO_TTS_VOICE must contain only letters, numbers, dots, underscores, and hyphens." >&2
  exit 1
fi

if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "ERROR: Python 3 is required but '$PYTHON_BIN' was not found in PATH." >&2
  exit 1
fi

if [[ ! -x "$PIPER_BIN" || ! -d "$PIPER_SITE_DIR/piper" || ! -f "$PIPER_VERSION_FILE" || "$(cat "$PIPER_VERSION_FILE")" != "$PIPER_VERSION" ]]; then
  echo "[client-demo] Installing piper-tts==$PIPER_VERSION into $PIPER_DIR" >&2
  mkdir -p "$PIPER_SITE_DIR" "$PIPER_DIR/bin"
  "$PYTHON_BIN" -m pip install --disable-pip-version-check --no-input --no-cache-dir --target "$PIPER_SITE_DIR" "piper-tts==$PIPER_VERSION" >&2
  printf '%s\n' "$PIPER_VERSION" > "$PIPER_VERSION_FILE"
  PYTHON_COMMAND="$(printf '%q' "$PYTHON_BIN")"
  cat > "$PIPER_BIN" <<EOF
#!/usr/bin/env bash
SCRIPT_DIR="\$(cd -- "\$(dirname -- "\${BASH_SOURCE[0]}")" && pwd)"
export PYTHONPATH="\$SCRIPT_DIR/../site-packages\${PYTHONPATH:+:\$PYTHONPATH}"
exec $PYTHON_COMMAND -m piper "\$@"
EOF
  chmod +x "$PIPER_BIN"
fi

mkdir -p "$VOICE_DIR"
if [[ ! -s "$MODEL_PATH" || ! -s "$CONFIG_PATH" ]]; then
  echo "[client-demo] Downloading Piper voice $VOICE_NAME into $VOICE_DIR" >&2
  PYTHONPATH="$PIPER_SITE_DIR${PYTHONPATH:+:$PYTHONPATH}" "$PYTHON_BIN" -m piper.download_voices --download-dir "$VOICE_DIR" "$VOICE_NAME" >&2
fi

if [[ ! -s "$MODEL_PATH" || ! -s "$CONFIG_PATH" ]]; then
  echo "ERROR: Piper voice download did not produce both '$MODEL_PATH' and '$CONFIG_PATH'." >&2
  exit 1
fi

echo "[client-demo] Free local neural voiceover is ready." >&2
echo "Voice model: $MODEL_PATH" >&2
echo "Natural profile: length 1.0, noise 0.667, width noise 0.8, sentence silence 0.12s, volume 1.0." >&2
echo "piper-tts==$PIPER_VERSION is GPL-3.0-or-later; review runtime and model terms before distribution." >&2
printf 'export DEMO_TTS_ENGINE=piper\n'
printf 'export DEMO_TTS_BIN=%q\n' "$PIPER_BIN"
printf 'export DEMO_TTS_MODEL=%q\n' "$MODEL_PATH"
printf 'export DEMO_TTS_LENGTH_SCALE=%q\n' "${DEMO_TTS_LENGTH_SCALE:-1}"
printf 'export DEMO_TTS_NOISE_SCALE=%q\n' "${DEMO_TTS_NOISE_SCALE:-0.667}"
printf 'export DEMO_TTS_NOISE_W_SCALE=%q\n' "${DEMO_TTS_NOISE_W_SCALE:-0.8}"
printf 'export DEMO_TTS_SENTENCE_SILENCE=%q\n' "${DEMO_TTS_SENTENCE_SILENCE:-0.12}"
printf 'export DEMO_TTS_VOLUME=%q\n' "${DEMO_TTS_VOLUME:-1}"
printf 'export DEMO_AUDIO_TARGET_LUFS=%q\n' "${DEMO_AUDIO_TARGET_LUFS:--16}"
printf 'export DEMO_AUDIO_MAX_TRUE_PEAK=%q\n' "${DEMO_AUDIO_MAX_TRUE_PEAK:--1.5}"
printf 'export DEMO_AUDIO_TARGET_LRA=%q\n' "${DEMO_AUDIO_TARGET_LRA:-7}"
