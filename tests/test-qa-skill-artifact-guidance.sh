#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

QA_EXECUTION="$ROOT_DIR/custom/skills/qa-execution/SKILL.md"
QA_DOCUMENTATION="$ROOT_DIR/custom/skills/qa-documentation/SKILL.md"
QA_TESTING="$ROOT_DIR/custom/skills/qa-testing/SKILL.md"

assert_contains() {
  local file="$1"
  local pattern="$2"

  if ! grep -Fq "$pattern" "$file"; then
    echo "Expected '$pattern' in $file" >&2
    exit 1
  fi
}

assert_contains "$QA_EXECUTION" "Capture screenshots when possible"
assert_contains "$QA_EXECUTION" 'artifacts/qa/<YYYY-MM-DD>/<feature-or-flow>/'
assert_contains "$QA_EXECUTION" "01-initial-render.png"
assert_contains "$QA_DOCUMENTATION" "## Evidence"
assert_contains "$QA_DOCUMENTATION" "Local Artifact Folder:"
assert_contains "$QA_DOCUMENTATION" "This evidence is local-only and does not need to be committed."
assert_contains "$QA_TESTING" "Screenshots  →  Capture organized local proof when possible"

echo "PASS: QA skills document local screenshot artifact guidance"
