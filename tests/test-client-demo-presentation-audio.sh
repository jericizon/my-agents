#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RECORDER="$ROOT_DIR/custom/skills/client-demo-presentation/assets/demo-recorder.mjs"
SKILL="$ROOT_DIR/custom/skills/client-demo-presentation/SKILL.md"
EXAMPLE="$ROOT_DIR/custom/skills/client-demo-presentation/assets/example-flow.mjs"
VOICEOVER="$ROOT_DIR/custom/skills/client-demo-presentation/assets/voiceover.mjs"
VOICEOVER_SETUP="$ROOT_DIR/custom/skills/client-demo-presentation/assets/setup-voiceover.sh"

assert_contains() {
  local file="$1"
  local pattern="$2"
  local description="$3"

  if ! grep -Fq -- "$pattern" "$file"; then
    echo "FAIL: $description" >&2
    echo "      Missing pattern: $pattern" >&2
    exit 1
  fi
}

assert_contains "$RECORDER" "--voiceover" "recorder exposes the voiceover flag"
assert_contains "$RECORDER" "DEMO_VOICEOVER" "recorder exposes the voiceover environment variable"
assert_contains "$RECORDER" "captionTimeline" "recorder captures caption timing"
assert_contains "$RECORDER" "AUDIO_STREAM" "recorder verifies the audio stream"
assert_contains "$VOICEOVER" "loudnorm" "voiceover mux uses final-track loudness normalization"
assert_contains "$VOICEOVER" "linear=false" "voiceover mux uses dynamic loudness normalization"
assert_contains "$SKILL" "--voiceover" "skill documents the voiceover flag"
assert_contains "$SKILL" "DEMO_VOICEOVER" "skill documents the voiceover environment variable"
assert_contains "$SKILL" "TTS" "skill documents the local TTS prerequisite"
assert_contains "$EXAMPLE" "voiceover" "example flow documents caption voiceover"
assert_contains "$SKILL" "DEMO_TTS_ENGINE" "skill documents the selectable TTS engine"
assert_contains "$SKILL" "DEMO_TTS_MODEL" "skill documents the Piper model path"
assert_contains "$SKILL" "DEMO_AUDIO_TARGET_LUFS" "skill documents the loudness target"
assert_contains "$SKILL" "DEMO_TTS_SENTENCE_SILENCE" "skill documents the natural voice profile"
assert_contains "$SKILL" "en_US-lessac-high" "skill documents the recommended natural voice"
assert_contains "$SKILL" "synthetic" "skill discloses the TTS voice is synthetic"
assert_contains "$SKILL" "setup-voiceover.sh" "skill documents the Piper setup script"
assert_contains "$SKILL" "GPL-3.0-or-later" "skill documents the Piper runtime license"
assert_contains "$VOICEOVER_SETUP" "GPL-3.0-or-later" "setup surfaces the Piper runtime license"
assert_contains "$VOICEOVER_SETUP" 'PIPER_VERSION="1.7.0"' "setup pins the free Piper runtime"
assert_contains "$VOICEOVER_SETUP" "PIPER_VERSION_FILE" "setup detects stale Piper caches"
assert_contains "$VOICEOVER_SETUP" '$(cat "$PIPER_VERSION_FILE")" != "$PIPER_VERSION"' "setup compares the cached Piper version"
assert_contains "$VOICEOVER_SETUP" 'piper-tts==$PIPER_VERSION' "setup installs the pinned Piper runtime"
assert_contains "$VOICEOVER_SETUP" "en_US-lessac-high" "setup selects a high-quality free voice"
assert_contains "$VOICEOVER_SETUP" "DEMO_TTS_SENTENCE_SILENCE" "setup emits the natural voice profile"
assert_contains "$VOICEOVER_SETUP" "DEMO_AUDIO_TARGET_LUFS" "setup emits the loudness target"
assert_contains "$VOICEOVER_SETUP" "DEMO_AUDIO_MAX_TRUE_PEAK" "setup emits the true-peak target"
assert_contains "$VOICEOVER_SETUP" "DEMO_AUDIO_TARGET_LRA" "setup emits the loudness-range target"
assert_contains "$VOICEOVER_SETUP" "piper.download_voices" "setup downloads the Piper voice"

if DEMO_TTS_VOICE='../outside' bash "$VOICEOVER_SETUP" >/dev/null 2>&1; then
  echo "FAIL: setup accepts a voice name with path traversal characters" >&2
  exit 1
fi

echo "PASS: client-demo-presentation audio guidance is wired through the recorder and docs"
