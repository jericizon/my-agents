---
name: comprehensive-qa-testing
description: Use when the user asks for comprehensive QA, real browser QA, Playwright MCP QA, real end-to-end testing, or live user-style validation against an already running application.
---

# Comprehensive QA Testing

## Overview

Run a real user-style QA pass in a live browser against an already running app. Prefer MCP-driven browser testing for page understanding and interaction. If MCP is unavailable, fall back to Playwright while keeping the same goals: exercise the real workflow, verify the UI behaves correctly, capture a previewable video, and generate a reusable E2E test for future regression coverage.

This skill is for comprehensive real-world browser validation. It is not just "run existing test cases."

## When to Use

Use this skill when:
- the user asks for `comprehensive qa`
- the user wants real end-to-end testing in a browser
- the user wants Playwright MCP testing or real browser QA
- the user wants the agent to act like a real user and validate the actual workflow
- the target application is already running and reachable

Do not use this skill when:
- the request is only to write a spec file without doing the live QA pass
- the request is only to run unit or integration tests
- the application is not running and the user only wants startup help

## Core Rules

- Assume the application is already running.
- Do not start `npm run dev`, `npm run preview`, `pnpm dev`, `docker compose`, or any equivalent server or watcher command.
- Use one main browser session whenever possible so auth, state, and workflow continuity are preserved.
- The main agent owns the live browser session.
- Sub-agents may support planning, risk review, coverage review, and E2E spec drafting, but they must not take over the main live browser session.
- Prefer MCP browser tooling first. If MCP is unavailable, fall back to Playwright CLI or repo-standard Playwright execution instead of blocking immediately.
- Save a video artifact for every comprehensive QA run.

## Workflow

1. Scan the repo first. Find the relevant route, page, feature, existing E2E patterns, auth helpers, fixtures, and Playwright configuration before touching the browser.
2. Confirm the main testing objective. Identify what success means in user-visible terms, not only technical terms.
3. Prefer a single persistent browser context and page. Reuse the same session for related actions unless isolation is required to avoid a false result.
4. If useful, dispatch support sub-agents for narrow tasks such as test-case extraction, risk identification, result checking, or drafting the eventual E2E spec.
5. Open the real application with MCP when available. Inspect the page and understand what the page is for before interacting.
6. Detect meaningful interactive elements:
   - buttons
   - links
   - menus
   - tabs
   - dialogs
   - text inputs
   - selects and comboboxes
   - radios and checkboxes
   - date, masked, or formatted fields
7. Determine which elements should be triggered and which fields must be filled to reach the objective.
8. Execute the workflow like a real user. Prefer visible, deliberate interactions over brittle shortcuts.
9. Where tooling allows it, include deliberate mouse movement during the live run so the saved preview is easier to review.
10. Verify controls are truly operable:
    - buttons trigger the intended action
    - inputs accept typing and reflect values correctly
    - selects, radios, and checkboxes can be changed correctly
    - disabled or conditionally enabled controls transition correctly
    - validation and error states behave correctly
11. Watch for errors during the run:
    - console errors
    - page crashes
    - uncaught exceptions
    - failed network behavior that breaks the objective
12. Validate the outcome, not just the clicks. Confirm the expected result is visible or otherwise provable in the UI.
13. Confirm the main objective was actually reached. If not, report where the flow failed and why.
14. After the live QA pass, create or update a reusable Playwright E2E spec file for future-proofing. Reuse repo patterns first and keep selectors and helpers aligned with the target repo.

## Runtime Strategy

### Preferred Path

Use browser MCP for live inspection and interaction when available because it lets the agent understand the real page state before and during testing.

### Fallback Path

If MCP is unavailable, continue with Playwright-based live testing instead of stopping immediately. Preserve the same expectations:
- real route coverage
- real UI interaction
- error checking
- result validation
- video capture
- reusable E2E spec output

If neither MCP nor Playwright execution is possible, report `BLOCKED` with the exact reason.

## Video And Session Artifacts

- Record a video for every comprehensive QA run.
- If the target repo already defines a standard Playwright output location, reuse it.
- Otherwise store recordings under `test-results/comprehensive-qa/`.
- Keep one browser session whenever possible so the recorded flow is coherent and useful for preview.

## Validation Standard

A comprehensive QA pass is not complete unless all of the following are true:
- the page purpose was understood from the live UI
- the relevant elements were detected before or during interaction
- the necessary controls and inputs were exercised
- important buttons worked correctly
- no blocking console or runtime errors were thrown during the validated flow
- the observed result matched the intended test case
- the main objective was actually reached

## E2E Output

When the live QA pass finishes, generate a reusable Playwright E2E test file that captures the validated path.

Prefer to:
- place the spec beside similar existing E2E specs
- reuse existing fixtures, helpers, and auth utilities
- preserve the same main happy path covered during the live run
- add enough assertions to protect the real objective, not only page navigation

When the workflow is complex, also create a neighboring `.spec.md` case artifact describing:
- route and entry assumptions
- auth assumptions
- covered user flows
- key inputs and controls
- validation points
- expected result
- blockers or known limitations

## Blocked Conditions

Report `BLOCKED` when:
- the app is not running or not reachable
- the target route or objective cannot be inferred safely
- required auth or seed data is unavailable
- browser tooling is unavailable and no viable Playwright fallback exists
- the workflow cannot be completed without unsafe assumptions

Blocked output must state the exact blocker and the minimum next action needed.
