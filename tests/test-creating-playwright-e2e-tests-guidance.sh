#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAILED=0

check_contains() {
    local file="$1"
    local pattern="$2"
    local description="$3"

    if grep -Fq "$pattern" "$file"; then
        echo "  [PASS] $description"
    else
        echo "  [FAIL] $description" >&2
        echo "        Missing pattern: $pattern" >&2
        echo "        File: $file" >&2
        return 1
    fi
}

for base in "$ROOT_DIR/custom/skills" "$ROOT_DIR/superpowers-agents/skills"; do
    echo "Checking $base"
    skill_file="$base/creating-playwright-e2e-tests/SKILL.md"

    if [[ ! -f "$skill_file" ]]; then
        echo "  [FAIL] missing skill file: $skill_file" >&2
        FAILED=$((FAILED + 1))
        echo ""
        continue
    fi

    check_contains "$skill_file" "Use when creating or updating a Playwright E2E spec file" \
        "frontmatter description matches the trigger" || FAILED=$((FAILED + 1))
    check_contains "$skill_file" "Scan the repo to infer the target page, route, or feature" \
        "skill requires repo-first target discovery" || FAILED=$((FAILED + 1))
    check_contains "$skill_file" "If the target is ambiguous or risky, ask the user to confirm" \
        "skill requires clarification for ambiguous targets" || FAILED=$((FAILED + 1))
    check_contains "$skill_file" "Use Playwright to inspect the live page when forms or interactive inputs are present" \
        "skill requires live Playwright inspection for forms" || FAILED=$((FAILED + 1))
    check_contains "$skill_file" ".spec.md" \
        "skill documents the adjacent human-readable case artifact" || FAILED=$((FAILED + 1))
    check_contains "$skill_file" "dynamic input data" \
        "skill requires dynamic input values by default" || FAILED=$((FAILED + 1))
    check_contains "$skill_file" "one browser boot" \
        "skill preserves session state across related cases" || FAILED=$((FAILED + 1))
    check_contains "$skill_file" "The app must already be running" \
        "skill assumes the app is already running" || FAILED=$((FAILED + 1))
    check_contains "$skill_file" "Do not start the app" \
        "skill forbids starting servers or watchers" || FAILED=$((FAILED + 1))
    check_contains "$skill_file" "important inputs are actually operable" \
        "skill requires operability checks for key form inputs" || FAILED=$((FAILED + 1))
    check_contains "$skill_file" 'not a replacement for `qa-testing`' \
        "skill stays narrow relative to qa-testing" || FAILED=$((FAILED + 1))

    echo ""
done

if [[ "$FAILED" -ne 0 ]]; then
    echo "FAIL: creating-playwright-e2e-tests guidance checks failed ($FAILED)" >&2
    exit 1
fi

echo "PASS: creating-playwright-e2e-tests guidance is present in custom and generated skill trees"
