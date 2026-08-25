#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RECORDER="$ROOT_DIR/custom/skills/client-demo-presentation/assets/demo-recorder.mjs"
SKILL="$ROOT_DIR/custom/skills/client-demo-presentation/SKILL.md"
EXAMPLE="$ROOT_DIR/custom/skills/client-demo-presentation/assets/example-flow.mjs"

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
assert_contains "$SKILL" "--voiceover" "skill documents the voiceover flag"
assert_contains "$SKILL" "DEMO_VOICEOVER" "skill documents the voiceover environment variable"
assert_contains "$SKILL" "TTS" "skill documents the local TTS prerequisite"
assert_contains "$EXAMPLE" "voiceover" "example flow documents caption voiceover"

echo "PASS: client-demo-presentation audio guidance is wired through the recorder and docs"
