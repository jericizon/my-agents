#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILL_FILE="$REPO_ROOT/custom/skills/demo-the-updates/SKILL.md"

if [[ ! -f "$SKILL_FILE" ]]; then
  echo "Missing demo-the-updates skill: $SKILL_FILE" >&2
  exit 1
fi

grep -Fq 'FEATURE_SET_SLUG' "$SKILL_FILE"
grep -Fq 'single feature' "$SKILL_FILE"
grep -Fq 'concise lowercase kebab-case feature-set summary' "$SKILL_FILE"
grep -Fq 'demo-session' "$SKILL_FILE"
grep -Fq 'only `[a-z0-9-]`' "$SKILL_FILE"
grep -Fq 'collapse repeated hyphens' "$SKILL_FILE"
grep -Fq 'trim leading/trailing hyphens' "$SKILL_FILE"
grep -Fq 'cap it at 60 characters' "$SKILL_FILE"
grep -Fq 'If normalization produces an empty value, use `demo-session`' "$SKILL_FILE"
grep -Fq 'docs/client-demo/<YYYYMMDD_HHMMSS>_<FEATURE_SET_SLUG>/' "$SKILL_FILE"
grep -Fq 'SESSION_DIR="docs/client-demo/$(date +%Y%m%d_%H%M%S)_${FEATURE_SET_SLUG}"' "$SKILL_FILE"
grep -Fq '# Demo Session: <feature set slug>' "$SKILL_FILE"

if grep -Eq 'docs/client-demo/[^`[:space:]]*_demo-the-updates|SESSION_DIR=.*_demo-the-updates' "$SKILL_FILE"; then
  echo "The session directory still uses the literal demo-the-updates suffix" >&2
  exit 1
fi

echo "PASS: demo-the-updates derives session names from the feature set"
