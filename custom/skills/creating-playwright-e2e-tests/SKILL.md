---
name: creating-playwright-e2e-tests
description: Use when creating or updating Playwright E2E test cases or a spec file for a page, route, or feature that must be inspected first and validated in the same session.
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
