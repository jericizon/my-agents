# Creating Playwright E2E Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new standalone `creating-playwright-e2e-tests` skill that discovers the target page or feature, inspects forms and live inputs with Playwright when needed, generates a `.spec.md` plus `.spec.ts`, preserves authenticated browser session state across related cases, and validates the spec in the same session without starting the app.

**Architecture:** Keep the implementation narrow: one new custom skill under `custom/skills`, one repo-local regression test for required guidance, then refresh the generated mirror with `./update-skills.sh`. Validate behavior with a manual smoke run against a temporary Playwright-shaped fixture repo where the app is intentionally not running, so the skill must reach the correct blocked state instead of trying to boot servers.

**Tech Stack:** Markdown skill files, bash regression tests, local skill sync scripts, Claude Code CLI for smoke validation

**Spec:** `docs/superpowers/specs/2026-06-05-creating-playwright-e2e-tests-design.md`

---

## Requirement-to-Task Alignment

| Requirement | Tasks | Tests/QA |
|---|---|---|
| Trigger on requests to create or update a Playwright E2E test file | 2, 3 | `bash tests/test-creating-playwright-e2e-tests-guidance.sh`, manual `claude -p` smoke run |
| Scan the repo to infer the target page, route, or feature | 2, 3 | Guidance assertions for repo scan phrasing, smoke run checks target inference before blocking |
| Ask for clarification only when the inferred target is ambiguous or risky | 2, 3 | Guidance assertions, smoke run prompt variant with ambiguous wording |
| Inspect implementation details before writing tests | 2, 3 | Guidance assertions, smoke run transcript review |
| Use Playwright to inspect live forms and interactive inputs when present | 2, 3 | Guidance assertions for live page inspection, smoke run transcript review |
| Create adjacent `.spec.md` and `.spec.ts` outputs | 2 | Guidance assertions for adjacent artifacts |
| Use dynamic input data by default | 2 | Guidance assertions for dynamic input behavior |
| Preserve authenticated session state with one browser boot by default | 2 | Guidance assertions for persistent session / one browser boot |
| Validate in the same session and never start the app | 2, 3 | Guidance assertions, smoke run must block on app availability instead of launching it |
| Report explicit blocked reasons when validation cannot complete | 2, 3 | Guidance assertions, smoke run transcript review |
| Keep the skill narrow and not a replacement for `qa-testing` | 2 | Guidance assertions for scope and non-goals |
| Ensure the custom skill is mirrored into `superpowers-agents/skills` | 2 | `./update-skills.sh`, `bash tests/test-creating-playwright-e2e-tests-guidance.sh` |

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `custom/skills/creating-playwright-e2e-tests/SKILL.md` | New standalone skill definition | Create |
| `tests/test-creating-playwright-e2e-tests-guidance.sh` | Repo-local regression test for required skill guidance in both custom and generated mirrors | Create |
| `docs/superpowers/specs/2026-06-05-creating-playwright-e2e-tests-design.md` | Approved design reference | Reference only |
| `superpowers-agents/skills/creating-playwright-e2e-tests/SKILL.md` | Generated mirror refreshed by sync script | Generated via `./update-skills.sh`, do not hand-edit |

---

### Task 1: Add the failing regression test first

**Files:**
- Create: `tests/test-creating-playwright-e2e-tests-guidance.sh`

- [ ] **Step 1: Create the regression test**

Create `tests/test-creating-playwright-e2e-tests-guidance.sh` with this content:

```bash
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
    check_contains "$skill_file" "not a replacement for `qa-testing`" \
        "skill stays narrow relative to qa-testing" || FAILED=$((FAILED + 1))

    echo ""
done

if [[ "$FAILED" -ne 0 ]]; then
    echo "FAIL: creating-playwright-e2e-tests guidance checks failed ($FAILED)" >&2
    exit 1
fi

echo "PASS: creating-playwright-e2e-tests guidance is present in custom and generated skill trees"
```

- [ ] **Step 2: Make the test executable**

Run:

```bash
chmod +x tests/test-creating-playwright-e2e-tests-guidance.sh
```

Expected: no output

- [ ] **Step 3: Run the new test to verify RED**

Run:

```bash
bash tests/test-creating-playwright-e2e-tests-guidance.sh
```

Expected: FAIL because `custom/skills/creating-playwright-e2e-tests/SKILL.md` and its generated mirror do not exist yet.

- [ ] **Step 4: Confirm the failure is correct**

Read the output and confirm the failure is due to missing skill files, not because the script itself is broken.

---

### Task 2: Write the skill, sync it, and make the regression test pass

**Files:**
- Create: `custom/skills/creating-playwright-e2e-tests/SKILL.md`
- Modify: `tests/test-creating-playwright-e2e-tests-guidance.sh` only if a wording mismatch between the final skill text and the approved spec needs to be corrected

- [ ] **Step 1: Create the new skill directory**

Run:

```bash
mkdir -p custom/skills/creating-playwright-e2e-tests
```

Expected: no output

- [ ] **Step 2: Write the new skill file**

Create `custom/skills/creating-playwright-e2e-tests/SKILL.md` with this content:

```markdown
---
name: creating-playwright-e2e-tests
description: Use when creating or updating a Playwright E2E spec file for a page, route, or feature that must be inspected first and validated in the same session.
---

# Creating Playwright E2E Tests

## Overview

Create or update a Playwright E2E spec by understanding the real target first. Scan the repo, confirm the page or feature, inspect live pages with Playwright when forms or interactive inputs are present, generate the adjacent case doc and `.spec.ts`, then validate the result in the same session.

This skill is for authoring a Playwright spec file. It is not a replacement for `qa-testing`.

## When to Use

Use this skill when:
- the user wants a Playwright E2E test file created or updated
- the target is a page, route, feature, or user workflow
- the repository already has a Playwright setup or an existing E2E layout to follow

Do not use this skill for:
- full QA sign-off across a broader feature or release
- application setup or Playwright installation from scratch
- requests that are only about executing existing specs

## Workflow

1. Scan the repo to infer the target page, route, or feature. Reuse the repo's existing test layout, selectors, helpers, fixtures, and auth utilities where possible.
2. If the target is ambiguous or risky, ask the user to confirm the inferred page, route, or feature before writing tests.
3. Inspect the implementation before editing: routes, page components, APIs, forms, existing specs, fixtures, and helpers.
4. Use Playwright to inspect the live page when forms or interactive inputs are present. Identify the fields that need coverage and confirm how typing, selecting, toggling, masking, formatting, disabling, and validation behave.
5. Write an adjacent `<feature>.spec.md` file beside the executable spec. Include route assumptions, auth prerequisites, fields that need coverage, required and optional inputs, dynamic data strategy, happy path, validation cases, regressions, and blockers.
6. Generate or update `<feature>.spec.ts` beside similar specs in the repo's existing Playwright structure.
7. Use dynamic input data by default. Reuse existing data builders first. Otherwise create lightweight inline generators so test inputs are not static unless the user explicitly requests fixed values.
8. For authenticated flows, prefer one browser boot with a persistent context and page. Move forward through related cases with navigation instead of re-booting the browser or re-logging for every test unless isolation is clearly required.
9. For forms, verify important inputs are actually operable, not just that submission succeeds. Check that key inputs accept typing, reflect values, change selection state correctly, and participate in validation and success flows.
10. Run the relevant Playwright command in the same session. Fix safe spec issues and rerun.
11. If the app is not running, auth prerequisites are unavailable, or the target remains too ambiguous, stop and report `BLOCKED` with the exact reason.

## Output Contract

Create or update:
- `<feature>.spec.ts`
- `<feature>.spec.md`

The `.spec.md` file must capture:
- target page, route, or feature
- entry path and navigation assumptions
- auth assumptions
- forms and interactive controls that need coverage
- required and optional fields
- dynamic input data strategy
- happy path, invalid input, edge cases, and regressions
- blockers and assumptions

## Coverage Rules

Always cover:
- happy path
- invalid input
- edge cases
- regression risks

When forms or interactive inputs exist, ensure important inputs are actually operable:
- text inputs accept typing and reflect the typed value
- checkboxes, radios, selects, or comboboxes change correctly
- masked or formatted inputs behave correctly during entry when applicable
- disabled or conditionally enabled inputs transition as intended
- validation messages and success states are exercised by the relevant fields

## Rules

- The app must already be running.
- Do not start the app, a dev server, a watcher, or docker compose.
- Never invent routes, fields, or validation rules without inspecting code or the live page.
- Keep changes minimal and aligned with the repo's existing Playwright patterns.
- Do not claim completion without an actual validation run in the same session.
```

- [ ] **Step 3: Run the sync script to mirror the custom skill**

Run:

```bash
./update-skills.sh
```

Expected:
- `custom/skills/creating-playwright-e2e-tests/SKILL.md` is copied into `superpowers-agents/skills/creating-playwright-e2e-tests/SKILL.md`
- runtime paths refresh via `setup-agents.sh`

- [ ] **Step 4: Run the regression test to verify GREEN**

Run:

```bash
bash tests/test-creating-playwright-e2e-tests-guidance.sh
```

Expected: PASS

- [ ] **Step 5: Fix wording mismatches only if the failure is real**

If the regression test fails:
- update the skill text to match the approved spec
- rerun `./update-skills.sh`
- rerun `bash tests/test-creating-playwright-e2e-tests-guidance.sh`

Do not weaken the test unless the approved spec changed.

- [ ] **Step 6: Commit the new skill and regression test**

Run:

```bash
git add custom/skills/creating-playwright-e2e-tests/SKILL.md tests/test-creating-playwright-e2e-tests-guidance.sh docs/superpowers/specs/2026-06-05-creating-playwright-e2e-tests-design.md docs/superpowers/plans/2026-06-05-creating-playwright-e2e-tests.md
git commit -m "feat(skills): add creating-playwright-e2e-tests skill"
```

Expected: commit succeeds on the implementation branch or worktree, not on protected `main`

---

### Task 3: Smoke-test the skill's blocked-path behavior against a temporary fixture repo

**Files:**
- No tracked repo files required; use a temporary fixture directory under `/tmp`

- [ ] **Step 1: Create a temporary fixture repo with a form page and Playwright shape**

Run:

```bash
FIXTURE_DIR="$(mktemp -d /tmp/creating-playwright-e2e-tests-XXXXXX)"
mkdir -p "$FIXTURE_DIR/src/pages" "$FIXTURE_DIR/tests/e2e"

cat > "$FIXTURE_DIR/package.json" <<'EOF'
{
  "name": "creating-playwright-e2e-tests-fixture",
  "private": true,
  "devDependencies": {
    "@playwright/test": "^1.54.0"
  },
  "scripts": {
    "test:e2e": "playwright test"
  }
}
EOF

cat > "$FIXTURE_DIR/playwright.config.ts" <<'EOF'
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e'
});
EOF

cat > "$FIXTURE_DIR/src/pages/profile-settings.tsx" <<'EOF'
export function ProfileSettingsPage() {
  return (
    <form>
      <label htmlFor="displayName">Display name</label>
      <input id="displayName" name="displayName" />

      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" />

      <label htmlFor="timezone">Timezone</label>
      <select id="timezone" name="timezone">
        <option value="">Choose one</option>
        <option value="asia-manila">Asia/Manila</option>
      </select>

      <label>
        <input type="checkbox" name="marketingOptIn" />
        Receive updates
      </label>

      <button type="submit">Save changes</button>
    </form>
  );
}
EOF
```

Expected: a temporary repo exists with a form page and a basic Playwright layout, but no running app

- [ ] **Step 2: Run an explicit-request smoke prompt from the fixture repo**

Run:

```bash
cd "$FIXTURE_DIR"
claude -p "creating-playwright-e2e-tests, please. Create an end-to-end test for the profile settings form. Inspect the page, identify the fields that need testing, use dynamic input data, keep the same browser session for related cases, and validate it in the same session." \
  --dangerously-skip-permissions \
  --max-turns 4
```

Expected behavior:
- the skill is invoked
- the agent infers the target page from repo files
- the agent identifies the form inputs that need coverage
- the agent states that the app must already be running
- the agent does not attempt to start the app
- the flow ends in a clear blocked state because live Playwright validation cannot proceed against a non-running app

- [ ] **Step 3: Run one ambiguity variant**

Run:

```bash
cd "$FIXTURE_DIR"
claude -p "creating-playwright-e2e-tests, please. Add an E2E test for the settings page." \
  --dangerously-skip-permissions \
  --max-turns 4
```

Expected behavior:
- the skill still scans the repo first
- if multiple settings targets seem plausible, the agent asks for clarification instead of inventing one

- [ ] **Step 4: Record what happened**

Capture:
- whether the skill loaded
- whether target inference was correct
- whether form fields were enumerated
- whether the agent refused to start the app
- whether the blocked reason was explicit and correct

If any of those fail, revise `custom/skills/creating-playwright-e2e-tests/SKILL.md`, rerun `./update-skills.sh`, rerun `bash tests/test-creating-playwright-e2e-tests-guidance.sh`, and repeat this smoke test.

- [ ] **Step 5: Final verification**

Run:

```bash
bash tests/test-creating-playwright-e2e-tests-guidance.sh
```

Expected: PASS

---

## Self-Review Checklist

- [ ] Every accepted design requirement maps to Task 2 or Task 3.
- [ ] The RED step fails because the skill is missing, not because the test is malformed.
- [ ] The final `SKILL.md` text includes target discovery, clarification, live Playwright inspection, adjacent artifact generation, dynamic inputs, one browser boot, blocked reasons, and the no-server-start rule.
- [ ] `./update-skills.sh` is the only mechanism used to refresh the generated mirror; `superpowers-agents/skills` is never hand-edited.
- [ ] Final verification includes both the repo-local regression test and a live smoke prompt that checks the blocked path.
