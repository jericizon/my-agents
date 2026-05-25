#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ignored_output="$(git -C "$ROOT_DIR" check-ignore -v superpowers-agents/skills/example/SKILL.md)"
if [[ "$ignored_output" != *".gitignore"* ]] || [[ "$ignored_output" != *"superpowers-agents/skills/"* ]]; then
  echo "Expected superpowers-agents/skills to be ignored by root .gitignore" >&2
  exit 1
fi

if git -C "$ROOT_DIR" check-ignore custom/skills/example/SKILL.md >/dev/null 2>&1; then
  echo "custom/skills should remain tracked and editable" >&2
  exit 1
fi

echo "PASS: generated skills mirror is ignored while custom skills remain trackable"
