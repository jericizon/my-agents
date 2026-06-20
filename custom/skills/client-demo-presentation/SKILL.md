---
name: client-demo-presentation
description: Use when the user wants a client-presentable or stakeholder demo walkthrough video of a feature in a running app — a real-browser screen recording with a visible moving mouse cursor and on-screen subtitle/caption instructions (e.g. "present how to log in", "record a demo of checkout", "make a client demo of X"). Produces a narrated video plus milestone screenshots saved under docs/client-demo/.
---

# Client Demo Presentation

## Overview

Produce a polished, client-presentable walkthrough of one feature in the already-running
app: a real Chromium screen recording with a **visible animated mouse cursor**, **on-screen
subtitle captions** narrating each step, **milestone screenshots**, and **one whole demo
video** (`.mp4` plus `.webm`).

This is **presentation, not QA**. It does not fix bugs or write tests — it tells the story
of how to use a feature for a non-technical audience. If the feature is broken or needs
validation/fixing first, use `comprehensive-qa-testing` instead.

Core principle: a plain Cypress / Playwright-MCP capture records only the page viewport
(no OS cursor), so it looks like a "preview" with values changing on their own. To get a
demo a client can follow, you must inject a moving cursor and a caption bar — which the
bundled recorder does for you.

## When to Use

Use this skill when the user wants any of:
- a client / stakeholder demo video of a feature
- a screen recording of the browser with a visible mouse moving between elements
- a narrated walkthrough with subtitle/caption instructions per step
- "present how to do X", "record a demo of X", "show the client how to X"
- a demo deliverable with screenshots + one full video

Do NOT use this skill when:
- the user wants validation/QA, bug fixing, or end-to-end test authoring → use `comprehensive-qa-testing`
- the app is not running and the user only wants startup help
- the user only wants static screenshots with no walkthrough

## Core Rules

- Assume the application is **already running**. Never start a dev/preview/watch server.
- The recorded flow must use a **visible moving cursor** (glide between targets) — not raw clicks.
- **Every step must have a subtitle caption** so a non-technical viewer can follow along.
- Capture a **screenshot at every key milestone** (open, each key action, final result).
- Produce **one whole video** of the full walkthrough (`.mp4` preferred, `.webm` always).
- Save all artifacts under `docs/client-demo/<timestamp>_<feature>/`.
- Use the bundled recorder at `assets/demo-recorder.mjs`. **Never edit the recorder** — only
  write a project-specific flow file.
- If the demo mutates data, restore it at the end so the environment is left unchanged.
- This skill does not fix product bugs. If the flow is blocked by a real defect, stop and
  report `BLOCKED`; hand off to `comprehensive-qa-testing` for fixing.

## Workflow (multi-phase sub-agents)

The main agent orchestrates and owns the final deliverable. Dispatch sub-agents for the
self-contained phases, in order:

1. **Resolve the request.** Capture the feature being demoed and the base URL of the running
   app (ask the user only if it cannot be inferred). Compute the output directory:
   `docs/client-demo/<YYYYMMDD_HHMMSS>_<feature_slug>/` (use `date +%Y%m%d_%H%M%S`).

2. **Phase A — Identify the feature (explore sub-agent).** Dispatch a read-only sub-agent to
   locate, in the repo, the route/page/component for the requested feature, the exact entry
   URL/path, required auth, the real selectors (labels, roles, test-ids) for each control,
   and any seed/demo credentials. It must return a concrete, ordered list of UI steps with
   real selectors — not guesses.

3. **Phase B — Author the flow + narration (general sub-agent).** Using Phase A's findings,
   copy `assets/example-flow.mjs` to `<out>/flow.mjs` (or a temp path) and adapt it:
   - one captioned step per user action (`h.caption(...)` before each step) — this is the subtitle script
   - `h.glideClick` / `h.glideTo` for visible cursor movement
   - `h.type` for realistic typing
   - `h.shot('<label>')` at every milestone
   - prove the final result on screen, then restore any mutated data
   The narration captions ARE the demo script; keep them short and client-friendly.

4. **Phase C — Record (the main agent runs this; see Runtime Setup).** Run the reusable
   tooling setup once, then run `assets/demo-recorder.mjs` against the running app with the
   Phase B flow, outputting into the `docs/client-demo/<timestamp>_<feature>/` directory.

5. **Verify the deliverable.** Confirm the directory contains the `.mp4`/`.webm` video, the
   numbered screenshots under `screenshots/`, and that the recorder exited 0 (no `FLOW_ERROR`).
   If the flow errored, fix the flow file (selectors/timing) and re-record. Then report the
   artifact paths to the user.

## Runtime Setup

The recorder is project-agnostic and self-contained. To avoid downloading Chromium for
every demo, keep tooling in a persistent cache and use **pnpm** (the same package manager
used across the user's projects). The cache lives in `~/.cache/client-demo-presentation/` by
default and is reusable across projects and devices.

Run the bundled setup script once. It is safe to run repeatedly — it skips installation if
the cache is already valid:

```bash
bash /abs/path/to/skills/client-demo-presentation/assets/setup-tooling.sh
```

Then record, pointing at the running app and the flow. Set `DEMO_MODULES` so the recorder
resolves Playwright from the cache, and `PLAYWRIGHT_BROWSERS_PATH` so it finds the cached
Chromium binaries:

```bash
CACHE_DIR="$HOME/.cache/client-demo-presentation"
OUT=/abs/path/to/repo/docs/client-demo/$(date +%Y%m%d_%H%M%S)_login

DEMO_MODULES="$CACHE_DIR" \
PLAYWRIGHT_BROWSERS_PATH="$CACHE_DIR/ms-browsers" \
  node /abs/path/to/skills/client-demo-presentation/assets/demo-recorder.mjs \
    --base http://localhost:3000 \
    --flow /abs/path/to/flow.mjs \
    --out  "$OUT" \
    --name login-demo
```

Notes:
- Playwright records `.webm` natively (no system ffmpeg). `ffmpeg-static` only transcodes to
  `.mp4`; if it is missing, the `.webm` is the deliverable (recorder warns, does not fail).
- Flags also settable via env: `DEMO_BASE / DEMO_FLOW / DEMO_OUT / DEMO_NAME / DEMO_WIDTH /
  DEMO_HEIGHT / DEMO_HEADED`. Set `DEMO_MODULES` if running the recorder from a dir other
  than where `node_modules` was installed.
- Run with no `--flow` to record a placeholder open-only clip that verifies the setup.

## Flow Helpers

The flow file exports `default async function runFlow(page, h)` and uses:

| Helper | Purpose |
|--------|---------|
| `h.goto(path)` | navigate (relative resolves against `--base`), waits networkidle |
| `h.caption(text)` | set the on-screen subtitle bar (the narration script) |
| `h.glideClick(locator)` | glide the visible cursor to the element, then click |
| `h.glideTo(locator)` | glide the cursor to the element without clicking |
| `h.type(locator, text)` | realistic per-key typing |
| `h.shot(label)` | capture numbered milestone screenshot `NNN_label.png` |
| `h.sleep(ms)` | pause so viewers can read the screen |

See `assets/example-flow.mjs` for a complete login walkthrough template.

## Deliverable Structure

```
docs/client-demo/
└── 20250620_143022_login/
    ├── login-demo.mp4        # the whole walkthrough (client-presentable)
    ├── login-demo.webm       # native recording (fallback if no ffmpeg)
    ├── flow.mjs              # the generated flow + caption script (optional to keep)
    └── screenshots/
        ├── 001_open.png
        ├── 002_email-entered.png
        ├── 003_password-entered.png
        └── 004_logged-in.png
```

## Completion Standard

A client demo is complete only when:
- the feature was correctly identified from the real repo (real route + selectors)
- every step in the recorded flow has a subtitle caption
- the cursor is visibly moving between targets
- a screenshot exists for each key milestone under `screenshots/`
- one whole video exists (`.mp4`, or `.webm` if ffmpeg is unavailable)
- artifacts are saved under `docs/client-demo/<timestamp>_<feature>/`
- the recorder exited cleanly (no `FLOW_ERROR`) and any mutated data was restored

## Blocked Conditions

Report `BLOCKED` (and do not fabricate a video) when:
- the app is not running or not reachable
- the feature/route cannot be located in the repo
- required auth or demo credentials are unavailable
- the flow hits a real product bug (hand off to `comprehensive-qa-testing` for fixing)
- no browser tooling can be installed (no Playwright, no network)

State the exact blocker and the minimum next action needed.
