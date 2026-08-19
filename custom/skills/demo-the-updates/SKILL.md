---
name: demo-the-updates
description: Use when the user wants to verify a feature end-to-end and then produce organized per-feature demo recordings of every important page/flow in a running app, grouped into one directory for easy review and recovery. Triggers on "demo the updates", "record all features", "verify and demo", "record every feature separately", or when a feature needs full validation before a grouped multi-clip demo walkthrough.
---

# Demo the Updates

## Overview

**Verify first, then record — every feature as its own clip, all grouped in one directory.**

This skill orchestrates two things in sequence:
1. **End-to-end verification** of the feature(s) — finish, fix, and confirm every flow works before any recording starts.
2. **Organized multi-clip demo recording** — record each page or major feature as a **separate** video using `client-demo-presentation`, with all clips grouped under **one** session directory for easy identification and review.

Core principle: a demo of a broken feature is worse than no demo. Verify every flow works (page loads, API requests, POS creation, expected success states) before hitting record. If a recording captures a problem, delete the faulty file and re-record after fixing — never ship a clip that contains a failed flow.

**REQUIRED SUB-SKILL:** Use `client-demo-presentation` for the actual recording mechanics (recorder, flow helpers, cursor/caption injection). This skill orchestrates around it — it does not replace the recorder.

## When to Use

Use this skill when the user wants any of:
- "demo the updates" / "record the new feature" / "verify and demo"
- every important feature recorded as separate clips for easier review/recovery
- a grouped set of demo videos organized in one directory
- full end-to-end verification before recording (not just presentation)
- server startup if the local server is down, then recording
- `.env`-based URL detection instead of assuming localhost

Do NOT use this skill when:
- the user wants a single-feature demo with no pre-verification → use `client-demo-presentation` directly
- the user wants QA/testing only with no demo video → use `comprehensive-qa-testing` or `real-user-qa`
- the user wants bug fixing only with no recording → use `systematic-debugging`

## Core Rules

- **Verify before recording.** Never record a flow that hasn't been confirmed working end-to-end. Page loads, API requests, form submissions, and expected success states must all pass first.
- **Each page or major feature is a separate recording.** One clip per feature/page — not one giant video. This makes review and re-recording isolated.
- **Group all recordings into one session directory.** Do NOT use the per-feature `docs/client-demo/<timestamp>_<feature>/` pattern from `client-demo-presentation`. Instead use a single parent directory with numbered sub-directories (see Deliverable Structure).
- **Detect the base URL from `.env` — never assume localhost.** Scan `.env`, `.env.local`, `.env.development`, `package.json` scripts, and app config for the actual URL the app runs on. Fall back to `localhost:3000` only if no env URL is found.
- **Start the server if it's down.** Unlike `client-demo-presentation`, this skill MAY start the dev server. Check health first; if unreachable, run `pnpm dev` (or the project's equivalent — check `package.json` scripts). Wait for the server to be ready before proceeding.
- **Login is recorded once.** Record the login/auth flow as the first clip (if auth is required). Subsequent feature clips skip the login screen and navigate directly to the feature page, reusing the authenticated session.
- **Go directly to feature pages.** After login, each feature clip starts at the feature's URL — not at the dashboard/home page with manual navigation. Skip repeatedly showing login or intermediate navigation unless it's part of the feature being demoed.
- **Re-record faulty clips.** If a recording contains a problem, a failed flow, a crash, or an unexpected state: delete the faulty recording files (video + screenshots), fix the underlying issue, re-verify, then re-record. Never keep a clip that contains a failed flow.
- **Verify every flow before moving to the next recording.** Don't batch-record then batch-verify. Verify clip N's flow, record clip N, confirm clip N is clean, then move to clip N+1.
- **Troubleshoot and fix issues as they arise.** If a page doesn't load, an API request fails, or a form submission errors — debug and fix it before recording. Restart/re-verify as needed.
- **Continue until every important feature is recorded.** Don't stop after the first feature. Enumerate all important features up front and record each one.
- **Use `client-demo-presentation` recorder and flow helpers.** Reuse the same `demo-recorder.mjs`, `example-flow.mjs` template, and `h.*` helpers. Write one flow file per feature clip.

## Workflow

### Phase 0 — Resolve & Discover

1. **Identify the feature(s) to demo.** Ask the user or infer from context which features/pages/flows need recording. Enumerate every important feature up front — this becomes the recording checklist.
2. **Detect the base URL.** Scan for the app URL in this order:
   - `.env.local`, `.env.development`, `.env` — look for `VITE_API_URL`, `NEXT_PUBLIC_API_URL`, `PORT`, `BASE_URL`, `API_URL`, `FRONTEND_URL`, or similar
   - `package.json` scripts (`dev`, `dev:frontend`, `dev:server`) — extract port from the command
   - App config files (`vite.config.*`, `next.config.*`, `nuxt.config.*`)
   - Fall back to `http://localhost:3000` only if nothing is found
   - If frontend and backend run on different ports, note both
3. **Compute the session directory:**
   `docs/client-demo/<YYYYMMDD_HHMMSS>_demo-the-updates/` (use `date +%Y%m%d_%H%M%S`).
   All clips go under this one directory as numbered sub-directories.

### Phase 1 — Server Health Check & Startup

1. **Check if the server is running.** `curl -sf <base_url>` or check the port. If reachable, proceed to Phase 2.
2. **If the server is down, start it.** Check `package.json` for the dev script (`pnpm dev`, `npm run dev`, `pnpm dev:frontend && pnpm dev:server`, or equivalent). Start it in the background. Wait for the server to become reachable (poll the health endpoint or base URL with a timeout).
3. **If both frontend and backend are separate processes**, start both. Check for separate scripts (`dev:frontend`, `dev:server`, `dev:api`).
4. **Confirm the server is healthy** before moving on. A failed health check after startup is a blocker — troubleshoot before proceeding.

### Phase 2 — End-to-End Verification (Before Any Recording)

1. **Verify every feature flow end-to-end.** For each feature on the recording checklist:
   - Navigate to the feature page — confirm it loads without errors
   - Exercise the core flow (form submission, API request, POS creation, etc.)
   - Confirm the expected success state (data saved, list updated, redirect happened, toast appeared)
   - Check for console errors, failed network requests, or unexpected states
2. **Fix any issues found.** If a flow is broken, debug and fix it (use `systematic-debugging` if needed). Apply the smallest safe fix. Re-verify the full flow after each fix.
3. **Do not proceed to recording until every feature on the checklist is verified working.** This is the gate — if any feature is broken and cannot be fixed, report it as `BLOCKED` for that feature and continue with the others.
4. **Record what was verified.** Keep a short checklist of feature → verified/blocked status. This becomes the recording order.

### Phase 3 — Organized Multi-Clip Recording

1. **Run the `client-demo-presentation` tooling setup** (one-time, persistent cache):
   ```bash
   bash <client-demo-presentation-skill-path>/assets/setup-tooling.sh
   ```
2. **Create the session directory:**
   ```bash
   SESSION_DIR="docs/client-demo/$(date +%Y%m%d_%H%M%S)_demo-the-updates"
   mkdir -p "$SESSION_DIR"
   ```
3. **Record clips in order.** For each feature on the verified checklist:
   - Compute the clip directory: `$SESSION_DIR/<NN>_<feature_slug>/` (zero-padded number: `01_login`, `02_pos-creation`, `03_dashboard`)
   - **Login clip (first, only once):** If auth is required, record the login flow as clip `01_login`. This is the only clip that shows the login page.
   - **Feature clips (subsequent):** Each feature clip navigates **directly** to the feature URL. Reuse the authenticated session (the recorder creates a fresh browser context per clip — either re-authenticate silently at the start of each flow file, or structure the flow to login then immediately navigate to the feature). Do not re-show the login screen in feature clips.
   - Author the flow file (Phase B of `client-demo-presentation`) — use `h.explain` for every control, `h.caption` for every step, `h.shot` at every milestone
   - Run the recorder:
     ```bash
     CACHE_DIR="$HOME/.cache/client-demo-presentation"
     CLIP_DIR="$SESSION_DIR/02_pos-creation"

     DEMO_MODULES="$CACHE_DIR" \
     PLAYWRIGHT_BROWSERS_PATH="$CACHE_DIR/ms-browsers" \
       node <client-demo-presentation-skill-path>/assets/demo-recorder.mjs \
         --base <base_url_from_env> \
         --flow "$CLIP_DIR/flow.mjs" \
         --out  "$CLIP_DIR" \
         --name pos-creation-demo
     ```
   - **Verify the clip immediately** (see Phase 4) before moving to the next feature

### Phase 4 — Per-Clip Verification & Re-recording

After each clip is recorded, verify it before moving to the next:

1. **Check the recorder exited 0** (no `FLOW_ERROR`). If it errored, fix the flow file (selectors/timing) and re-record.
2. **Confirm the clip directory contains** the `.mp4` (or `.webm`) video and numbered screenshots under `screenshots/`.
3. **Review the clip for problems.** Check for:
   - Failed flows captured on video (API error visible, form submission failed, page crash)
   - Missing expected success states (no confirmation, no data saved)
   - Broken selectors (element not found, wrong element highlighted)
   - Page load failures or blank screens
4. **If the clip contains a problem:**
   - Delete the faulty clip files: `rm -rf "$CLIP_DIR"` (video + screenshots + flow)
   - Fix the underlying issue (flow file selectors, timing, or product bug)
   - Re-verify the fix works (Phase 2 mini-check)
   - Re-record the clip from scratch
   - Re-verify the new clip
5. **Only move to the next feature after the current clip is clean.**

### Phase 5 — Session Manifest & Completion

1. **Write a manifest file** at `$SESSION_DIR/MANIFEST.md` indexing every clip:
   ```markdown
   # Demo Session: <feature set name>
   Date: <YYYY-MM-DD HH:MM>
   Base URL: <url>
   Server: <started | already running>

   ## Clips
   1. [01_login](01_login/) — Auth flow (recorded once)
   2. [02_pos-creation](02_pos-creation/) — POS creation flow
   3. [03_dashboard](03_dashboard/) — Dashboard overview
   ...

   ## Verification
   - All features verified end-to-end before recording: yes
   - Every clip reviewed for failed flows: yes
   - Re-recorded clips: <list or none>
   ```
2. **Confirm every feature on the checklist has a clean clip.** If any feature was `BLOCKED` during verification and could not be fixed, note it in the manifest.
3. **Report the session directory path and manifest to the user.**

## Deliverable Structure

```
docs/client-demo/
└── 20250819_143022_demo-the-updates/
    ├── MANIFEST.md                    # session index + verification status
    ├── 01_login/
    │   ├── login-demo.mp4
    │   ├── login-demo.webm
    │   ├── flow.mjs
    │   └── screenshots/
    │       ├── 001_open.png
    │       └── 002_logged-in.png
    ├── 02_pos-creation/
    │   ├── pos-creation-demo.mp4
    │   ├── pos-creation-demo.webm
    │   ├── flow.mjs
    │   └── screenshots/
    │       ├── 001_pos-page.png
    │       └── 002_pos-created.png
    └── 03_dashboard/
        ├── dashboard-demo.mp4
        ├── dashboard-demo.webm
        ├── flow.mjs
        └── screenshots/
            └── 001_dashboard.png
```

## URL Detection Reference

Scan these files in order for the base URL:

| Source | Variables / Patterns |
|--------|---------------------|
| `.env.local` | `VITE_API_URL`, `NEXT_PUBLIC_API_URL`, `BASE_URL`, `API_URL`, `FRONTEND_URL` |
| `.env.development` | same as above |
| `.env` | same as above + `PORT` |
| `package.json` | `scripts.dev` — extract `--port` or `PORT=` from the command |
| `vite.config.*` | `server.port` |
| `next.config.*` | `server.port` (experimental) |

If the frontend and backend are separate, note both URLs. The recorder `--base` should point at the frontend. API calls from the browser will use whatever the frontend is configured to call.

## Server Startup Reference

Check `package.json` scripts for the right command:

| Script pattern | Command |
|----------------|---------|
| `pnpm dev` | `pnpm dev` |
| `npm run dev` | `npm run dev` |
| separate frontend/backend | `pnpm dev:frontend` + `pnpm dev:server` |
| monorepo workspace | `pnpm --filter <package> dev` |

Start in the background, poll the health endpoint until reachable:
```bash
pnpm dev &  # or equivalent
# Poll until ready
for i in $(seq 1 30); do
  curl -sf "$BASE_URL" >/dev/null 2>&1 && break
  sleep 2
done
```

## Completion Standard

A demo-the-updates session is complete only when:
- the base URL was detected from `.env`/config (not blindly assumed as localhost)
- the server was confirmed running (started if needed, health-checked)
- **every feature on the checklist was verified end-to-end before recording**
- each feature was recorded as a **separate clip** under the **one session directory**
- login was recorded once (if needed); feature clips go directly to feature pages
- **every clip was reviewed** for failed flows, and any faulty clip was deleted and re-recorded
- the session directory contains a `MANIFEST.md` indexing all clips
- no clip in the final deliverable contains a failed flow, broken selector, or missing success state
- any `BLOCKED` features (couldn't fix) are noted in the manifest with the blocker reason

## Blocked Conditions

Report `BLOCKED` for a specific feature (and continue with others) when:
- the feature/route cannot be located in the repo
- required auth or demo credentials are unavailable
- the flow hits a real product bug that cannot be safely fixed
- the server cannot be started or reached after reasonable attempts

State the exact blocker and the minimum next action needed for that feature. Do not let one blocked feature stop the recording of other verified features.
