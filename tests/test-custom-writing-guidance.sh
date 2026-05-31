#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

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

FAILED=0

echo "Checking custom writing guidance overrides..."

for base in "$REPO_ROOT/custom/skills" "$REPO_ROOT/superpowers-agents/skills"; do
    echo "Checking $base"

    check_contains "$base/brainstorming/SKILL.md" "## Spec Specificity Standard" \
        "brainstorming defines the spec specificity standard" || FAILED=$((FAILED + 1))
    check_contains "$base/brainstorming/SKILL.md" "Acceptance criteria must be verifiable bullets" \
        "brainstorming requires verifiable acceptance criteria" || FAILED=$((FAILED + 1))
    check_contains "$base/brainstorming/SKILL.md" "Data, validation, permissions, and error behavior" \
        "brainstorming requires implementation-aligned constraints" || FAILED=$((FAILED + 1))
    check_contains "$base/brainstorming/spec-document-reviewer-prompt.md" "Implementation Readiness" \
        "spec reviewer checks implementation readiness" || FAILED=$((FAILED + 1))

    check_contains "$base/writing-plans/SKILL.md" "## Requirement-to-Task Alignment" \
        "writing-plans defines requirement-to-task alignment" || FAILED=$((FAILED + 1))
    check_contains "$base/writing-plans/SKILL.md" "Every spec requirement must map to at least one task" \
        "writing-plans requires every spec requirement to map to tasks" || FAILED=$((FAILED + 1))
    check_contains "$base/writing-plans/SKILL.md" "exact validation rule" \
        "writing-plans forbids vague validation instructions" || FAILED=$((FAILED + 1))
    check_contains "$base/writing-plans/plan-document-reviewer-prompt.md" "Requirement Mapping" \
        "plan reviewer checks requirement mapping" || FAILED=$((FAILED + 1))

    echo ""
done

if [[ "$FAILED" -ne 0 ]]; then
    echo "FAIL: custom writing guidance checks failed ($FAILED)" >&2
    exit 1
fi

echo "PASS: custom writing guidance overrides are present"
