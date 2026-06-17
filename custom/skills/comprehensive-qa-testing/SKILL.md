---
name: comprehensive-qa-testing
description: Use when the user asks for comprehensive QA, real browser QA, Playwright MCP QA, real end-to-end testing, or live user-style validation against an already running application.
---

# Comprehensive QA Testing

## Overview

Run a real user-style QA pass in a live browser against an already running app. This skill is a strict orchestrator for comprehensive QA: the main agent owns the end-to-end goal, a tester lane drives the live workflow with MCP-first browser testing, and a fixer lane removes blockers before the workflow is allowed to advance to final E2E authoring.

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
- The main agent is the orchestrator. It owns the concrete user-visible objective and the completion decision.
- Use a tester sub-agent for the live workflow. The tester owns browser QA, interaction coverage, and precise blocker reporting.
- Use a fixer sub-agent to remove blockers with the smallest safe change. The fixer may patch application code when the live QA run reveals a real product bug.
- Sub-agents must not take over the main live browser session.
- Prefer MCP browser tooling first. If MCP is unavailable, fall back to Playwright CLI or repo-standard Playwright execution instead of blocking immediately.
- If a blocker appears during the QA flow and a safe fix is obvious, apply the smallest fix that removes the blocker, preserves the current user flow, and avoids unrelated cleanup or refactoring.
- After every fix, rerun the failed portion first and then rerun the full main objective before moving forward.
- Do not move to final E2E authoring while the main objective still has an active blocker.
- Save a video artifact for every comprehensive QA run.

## Workflow

1. Scan the repo first. Find the relevant route, page, feature, existing E2E patterns, auth helpers, fixtures, and Playwright configuration before touching the browser.
2. Confirm the main testing objective. Identify what success means in user-visible terms, not only technical terms.
3. Prefer a single persistent browser context and page. Reuse the same session for related actions unless isolation is required to avoid a false result.
4. Act as the main orchestrator for the whole QA run. Keep the live goal, blocker state, and completion gate in one place.
5. Dispatch a tester sub-agent for the live workflow. The tester owns browser QA, interaction coverage, and precise blocker reporting.
6. Open the real application with Playwright MCP when available. Use MCP tools to navigate, interact, and capture screenshots. Inspect the page and understand what the page is for before interacting.
7. Detect meaningful interactive elements:
   - buttons
   - links
   - menus
   - tabs
   - dialogs
   - text inputs
   - selects and comboboxes
   - radios and checkboxes
   - date, masked, or formatted fields
8. Determine which elements should be triggered and which fields must be filled to reach the objective.
9. Execute the workflow like a real user. Prefer visible, deliberate interactions over brittle shortcuts.
10. Capture screenshots at each key milestone using Playwright MCP (e.g., `mcp_playwright_screenshot`). Use incremental IDs (001.png, 002.png, etc.) and save to `docs/qa-artifacts/<timestamp>_<task_or_feature>/`.
11. Where tooling allows it, include deliberate mouse movement during the live run so the saved preview and video are easier to review.
12. Verify controls are truly operable:
    - buttons trigger the intended action
    - inputs accept typing and reflect values correctly
    - selects, radios, and checkboxes can be changed correctly
    - disabled or conditionally enabled controls transition correctly
    - validation and error states behave correctly
13. Watch for errors during the run:
    - console errors
    - page crashes
    - uncaught exceptions
    - failed network behavior that breaks the objective
14. If the tester finds a blocker, capture a screenshot of the failure state, then dispatch the fixer sub-agent with the exact failing behavior, evidence, and the rule to make the smallest safe fix.
15. After each fix, rerun only the failed portion first. If that passes, rerun the full main objective end to end.
16. Repeat the test-fix-rerun loop until the full objective passes or the blocker cannot be safely removed.
17. Validate the outcome, not just the clicks. Confirm the expected result is visible or otherwise provable in the UI.
18. Confirm the main objective was actually reached. If not, report where the flow failed and why.
19. Only after the live QA pass finishes successfully may you create or update a reusable Playwright E2E spec file for future-proofing. Reuse repo patterns first and keep selectors and helpers aligned with the target repo.

## Runtime Strategy

### Preferred Path

Use Playwright MCP server for live inspection, interaction, and artifact capture when available. This enables:
- Real-time page state inspection before and during testing
- Direct screenshot capture with `mcp_playwright_screenshot`
- Video recording of full test sessions when supported
- Precise control over browser actions and assertions

Always capture screenshots at key test milestones using incremental IDs and save to `docs/qa-artifacts/<timestamp>_<task_or_feature>/`.

### Fallback Path

If Playwright MCP is unavailable, continue with Playwright CLI-based live testing instead of stopping immediately. Preserve the same expectations:
- real route coverage
- real UI interaction
- error checking
- result validation
- screenshot capture at key milestones (001.png, 002.png, etc.)
- video capture of full sessions when possible
- reusable E2E spec output

Use Playwright's built-in screenshot and video options to maintain the artifact structure defined above.

If neither MCP nor Playwright execution is possible, report `BLOCKED` with the exact reason.

## Screenshot And Video Artifacts

When running E2E tests, always capture visual proof of changes using the Playwright MCP server. This provides concrete evidence of test execution and results.

### Screenshot Requirements

- Take screenshots at key moments during testing:
  - Initial page state
  - After significant interactions
  - Final result/state verification
  - Any error or failure states
- Use incremental numeric IDs for filenames (001, 002, 003, etc.) for easy chronological tracking
- Store screenshots in: `docs/qa-artifacts/<timestamp>_<task_or_feature>/<screenshot_id>.png`
  - Example: `docs/qa-artifacts/20250617_143022_user_login/001.png`
  - Example: `docs/qa-artifacts/20250617_143022_user_login/002.png`

### Video Recording

- Record a video of the full test run whenever the Playwright MCP supports it
- Use incremental IDs if multiple videos are needed (001_video, 002_video, etc.)
- Store videos in the same directory as screenshots: `docs/qa-artifacts/<timestamp>_<task_or_feature>/<video_id>.webm`
- If the target repo already defines a standard Playwright output location, reuse it
- Otherwise store recordings under `docs/qa-artifacts/` following the naming convention above
- Keep one browser session whenever possible so the recorded flow is coherent and useful for preview

### Artifact Directory Structure

```
docs/qa-artifacts/
├── 20250617_143022_user_login/
│   ├── 001.png          # Initial state
│   ├── 002.png          # After form fill
│   ├── 003.png          # Success state
│   └── 001_video.webm   # Full run recording
└── 20250617_144511_checkout_flow/
    ├── 001.png
    ├── 002.png
    └── 001_video.webm
```

### Using Playwright MCP for Screenshots and Video

When available, use the Playwright MCP server to:
1. Navigate to pages and perform actions
2. Capture screenshots at key states via MCP tools
3. Record video of the full session when supported
4. Save artifacts to the specified directory structure

If Playwright MCP is unavailable, use Playwright CLI with equivalent screenshot and video options.

## Validation Standard

A comprehensive QA pass is not complete unless all of the following are true:
- the page purpose was understood from the live UI
- the relevant elements were detected before or during interaction
- the necessary controls and inputs were exercised
- important buttons worked correctly
- no blocking console or runtime errors were thrown during the validated flow
- the observed result matched the intended test case
- the main objective was actually reached
- screenshots were captured at key milestones with incremental IDs (001.png, 002.png, etc.)
- screenshots are saved in `docs/qa-artifacts/<timestamp>_<task_or_feature>/`
- video recording was attempted when Playwright MCP supports it
- every blocker fixed during the run was revalidated by rerunning the failed portion first
- the full main objective was rerun successfully after the last fix

Artifact creation is not the completion signal. The live objective must be complete first.

## E2E Output

When the live QA pass finishes successfully, generate a reusable Playwright E2E test file that captures the validated path.

Final E2E authoring is the last phase, not a fallback when the live QA goal is still failing.

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

If the main goal remains blocked but the defect is reproducible, you may create a failing regression artifact only when it truthfully captures the unresolved defect. In that case, report the run as `BLOCKED` or defect-present, not as successful comprehensive QA.

## Blocked Conditions

Report `BLOCKED` when:
- the app is not running or not reachable
- the target route or objective cannot be inferred safely
- required auth or seed data is unavailable
- browser tooling is unavailable and no viable Playwright fallback exists
- the workflow cannot be completed without unsafe assumptions
- the blocker cannot be removed with a small, targeted fix that preserves the intended flow

Blocked output must state the exact blocker and the minimum next action needed.
Blocked output must also make clear whether any created regression artifact represents unresolved-defect coverage rather than successful completion of the main QA goal.
