#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAILED=0

assert_contains() {
  local file="$1"
  local pattern="$2"
  local description="$3"

  if grep -Fq "$pattern" "$file"; then
    echo "  [PASS] $description"
  else
    echo "  [FAIL] $description" >&2
    echo "        Missing pattern: $pattern" >&2
    echo "        File: $file" >&2
    FAILED=$((FAILED + 1))
  fi
}

for base in "$ROOT_DIR/custom/skills" "$ROOT_DIR/superpowers-agents/skills"; do
  echo "Checking $base"

  assert_contains "$base/creating-playwright-e2e-tests/SKILL.md" \
    "Use when creating or updating Playwright E2E test cases or a spec file" \
    "new skill explicitly matches create-e2e wording"

  assert_contains "$base/qa-planning/SKILL.md" \
    "use creating-playwright-e2e-tests instead" \
    "qa-planning defers Playwright E2E authoring to the new skill"

  assert_contains "$base/qa-testing/SKILL.md" \
    "use creating-playwright-e2e-tests instead" \
    "qa-testing defers Playwright E2E authoring to the new skill"

  assert_contains "$base/qa-execution/SKILL.md" \
    "use creating-playwright-e2e-tests instead" \
    "qa-execution defers Playwright E2E authoring to the new skill"

  echo ""
done

if [[ "$FAILED" -ne 0 ]]; then
  echo "FAIL: Playwright E2E priority guidance checks failed ($FAILED)" >&2
  exit 1
fi

echo "PASS: Playwright E2E priority guidance points to creating-playwright-e2e-tests"
