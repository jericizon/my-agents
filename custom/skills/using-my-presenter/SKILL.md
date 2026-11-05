---
name: using-my-presenter
description: Use when the user wants a client-presentable or stakeholder demo walkthrough video of one or more features in a running app — a real-browser screen recording with a visible moving mouse cursor, spotlight highlights, on-screen caption narration, optional spoken voiceover, milestone screenshots, and (for multiple features) organized per-feature clips in one session directory. Verifies flows work before recording. Triggers on "record a demo of X", "client demo", "demo the updates", "record all features", "verify and demo".
---

# Using My Presenter

## Overview

**Verify first, then record.** Produce polished, client-presentable walkthrough videos of the already-running app: real Chromium recordings with a **visible animated mouse cursor**, **spotlight highlighting** on narrated elements, **subtitle captions burned below the browser window**, **milestone screenshots**, and `.mp4` output composited as a **macOS-style floating browser window** on a white canvas. Optional `--voiceover` narrates through VoiceStudio — audio-driven: each `h.narrate()` holds the scene for its measured speech duration, so a spoken line always finishes before the next step begins. Narration lines are pre-synthesized before and during the recording, so speech runs continuously with only a small beat gap between lines.

Two scales, one pipeline:

- **Single feature** → verify that flow, record one clip.
- **Feature set** ("demo the updates") → verify every feature end-to-end, record each as a **separate numbered clip** under one session directory with a `MANIFEST.md` index.

A demo of a broken feature is worse than no demo. This skill **does** fix flow-blocking defects found during verification (smallest safe fix, re-verify); it does not do general QA — that's `using-my-qa`. If a defect can't be safely fixed, mark that feature `BLOCKED` and continue with the rest.

Core principle: a plain Cypress / Playwright-MCP capture records only the page viewport (no OS cursor), so it looks like a "preview" with values changing on their own. To get a demo a client can follow, the bundled recorder injects a moving cursor, spotlight, and caption bar.

## When to Use

- a client / stakeholder demo video of a feature or feature set
- a screen recording with a visible mouse moving between elements
- a narrated walkthrough with subtitle/caption instructions per step, or spoken voiceover
- "present how to do X", "record a demo of X", "demo the updates", "record all features", "verify and demo"
- organized per-feature clips grouped in one directory for review/recovery

Do NOT use when:

- the user wants validation/QA or end-to-end test authoring with no demo → use `using-my-qa`
- the user wants bug fixing only, no recording → use `systematic-debugging`
- the user only wants static screenshots with no walkthrough

## Core Rules

- **Verify before recording.** Never record a flow that hasn't been confirmed working end-to-end: page loads, API requests succeed, expected success state appears, no console errors.
- **Check server health first; start it if down.** Detect the base URL from `.env`/config (never assume localhost — see URL Detection). If unreachable, start the dev server per `package.json` scripts and poll until ready. This skill MAY start servers.
- The recorded flow must use a **visible moving cursor** (glide between targets) — not raw clicks.
- **Every step must have a subtitle caption** so a non-technical viewer can follow. Captions burn into a dedicated strip below the browser window — outside the wrapper, never over app content.
- **Explain the whole page, not just the happy path.** Walk every meaningful control — inputs, toggles, dropdowns, tabs, secondary buttons — with `h.explain(...)`, even ones the flow never touches, each spotlight-highlighted while narrated.
- **Follow through to downstream pages.** If the action changes content elsewhere (admin publishes → public site), navigate there and show the outcome before ending.
- **One clip per feature.** For a feature set, each page/major feature is a separate recording so review and re-recording stay isolated. Login is recorded **once** as the first clip; later clips reuse the session and go directly to feature pages.
- **Re-record faulty clips.** If a clip captures a failed flow, crash, or wrong state: delete it, fix the cause, re-verify, re-record. Never ship a clip containing a failed flow.
- Verify each clip **immediately after recording it**, before the next feature. Don't batch-record then batch-verify.
- If the demo mutates data, restore it at the end so the environment is left unchanged.
- Use the bundled recorder at `assets/demo-recorder.mjs`. **Do not edit the recorder** for an individual demo — only write a project-specific flow file (copy `assets/example-flow.mjs`).
- Treat existing recordings as read-only. Never wildcard-select or overwrite an artifact; post-processing requires an explicit user request and a separately named output.

### Voiceover rules

- **Default: no voiceover.** Record silently (captions only) unless the user explicitly asks for spoken narration; pass `--voiceover` / `DEMO_VOICEOVER=1` only then. Caption voiceover only — no app audio, no invented music.
- **VoiceStudio is the ONLY narration engine** — a local app exposing an OpenAI-compatible TTS API at `http://localhost:3900` (`VS_BASE_URL` to relocate). There is no Piper/espeak/other fallback.
- **WSL2:** when `VS_BASE_URL` is unset the recorder probes `localhost` first, then the WSL2 default gateway (the Windows host) — VoiceStudio running on Windows serves WSL2 projects with zero config. Running VoiceStudio *inside* WSL2 needs WSLg (Electron GUI); prefer the Windows install.
- **Availability ladder — walk it BEFORE recording with `--voiceover`:**
  1. Probe `curl -sf $VS_BASE_URL/v1/audio/voices`.
  2. Down but installed → launch `VoiceStudio` (`~/.local/bin/VoiceStudio`) in the background and poll until the API responds (~30×2s; first boot downloads its runtime and can take minutes).
  3. Not installed → **ask the user whether to install VoiceStudio**; on confirmation run `assets/setup-voicestudio.sh` (latest `debpalash/VoiceStudio` GitHub release → `~/.local/bin`), then launch and poll.
  4. Still unreachable, install declined/failed → record **without** narration — the voiceover request is disregarded (the recorder does this itself); say so in the report. Never substitute another engine.
- **One voice for the whole video.** Default `"The Companion"` profile (`VS_VOICE=fc52c689`); change only when the user names a different voice. `VS_SPEED` sets pace (default `1.2` — a normal conversational rate); `VS_MODEL`, `VS_SEED`, `VS_INSTRUCTIONS` tune the speech request.
- **Audio-driven pacing — measured duration is authoritative.** Before the camera rolls, the recorder statically extracts every literal `h.narrate()`/`h.explain()` line from the flow source and pre-synthesizes it through a single-worker VoiceStudio queue (started during browser setup, so audio is on disk when the beat arrives — spoken lines land back-to-back with only `DEMO_VO_GAP_MS` between them, default 350). A line that isn't a plain string literal still works — it's synthesized on demand, overlapped with the previous narration where possible. `h.narrate(text)` then measures the REAL audio length, shows the caption, and holds the scene until the speech has finished. Gated helpers (`goto`, `glideTo`, `glideClick`, `highlight`, `caption`, `explain`) also wait, so cursor, spotlight, click, navigation, and captions never advance while narration plays. A long narration simply extends the scene — speech is never sped up, trimmed, or time-stretched to fit a window, and the mux contains no `atempo`/tempo filters (only `adelay` + `amix` + `loudnorm`). `DEMO_VO_TAIL_MS` (default 400) keeps the last word inside the capture.
- **`h.narrate(text)` is the spoken helper; `h.caption(text)` is visual-only.** A caption alone does NOT produce speech or guarantee audio sync — use `narrate()` for every line that must be read aloud. `h.waitForNarration()` resolves once active narration finishes (no-op when idle); fixed `h.sleep()` padding is never a substitute for narration completion.
- **Background music is automatic with `--voiceover`** — no extra flag. The bundled bed is a deterministic ambient pad synthesized by ffmpeg at mux time (`aevalsrc`: a soft Dm-add9 voicing, breathing LFOs — no external file, no licensing issues, always seamless). It is trimmed to the clip duration, fades in 1.5s / out 2s, and is sidechain-ducked ~20dB+ under narration, becoming slightly more present in pauses. **`--music none`** disables it; **`--music /path/to/track.mp3`** substitutes a custom bed (missing file → warns and falls back to the bundled bed; custom files loop via `-stream_loop`). Tune level with `DEMO_MUSIC_GAIN` (linear, default 0.25) and fades with `DEMO_MUSIC_FADE_IN`/`DEMO_MUSIC_FADE_OUT`. Without `--voiceover` there is no audio chain — recordings stay silent as before; music is never added to a non-narrated clip. Troubleshooting: bed too loud/quiet → adjust `DEMO_MUSIC_GAIN`; voice drowned → lower gain below 0.2 before touching `VS_*`.
- Verify `AUDIO_STREAM=` in recorder logs and probe the final file (`ffmpeg -i <video> -map 0:a:0 -f null -`).
- The mux applies single-pass EBU R128 loudness normalization (`-16 LUFS`, `-1.5 dBTP`, `7 LU`). Override only via `DEMO_AUDIO_TARGET_LUFS` / `DEMO_AUDIO_MAX_TRUE_PEAK` / `DEMO_AUDIO_TARGET_LRA` when the delivery platform requires it — no guessed `dynaudnorm`/volume boosts.
- VoiceStudio is synthetic TTS — natural-sounding but not human. Never claim human/non-AI narration; that claim requires a supplied human recording.

## Workflow

### Phase 0 — Resolve scope, URL, output dir

1. **Feature checklist.** For a single feature, capture it and the app's base URL (ask only if it can't be inferred). For a set, enumerate every important feature up front — this becomes the recording checklist and order.
2. **Detect the base URL** from `.env.local`, `.env.development`, `.env`, `package.json` scripts, then app config (`vite.config.*`, `next.config.*`). Fall back to `http://localhost:3000` only if nothing is found. Note frontend vs backend ports if split.
3. **Output dir:** `<project shared dir>/docs/client-demo/<YYYYMMDD_HHMMSS>_<slug>/` (Shared Workspace Artifacts in global rules; `date +%Y%m%d_%H%M%S`). Slug = feature name, or a concise kebab-case feature-set summary (`[a-z0-9-]`, ≤60 chars, else `demo-session`).

### Phase 1 — Server health check

`curl -sf <base_url>`. If unreachable, start the dev server (`pnpm dev` or the project's equivalent — check `package.json`; monorepo: `pnpm --filter <pkg> dev`; split apps: start frontend and backend both). Poll the base URL until reachable (30×2s). Still down → `BLOCKED`.

### Phase 2 — Explore (per feature)

Dispatch a read-only sub-agent to locate in the repo: route/page/component, exact entry URL, required auth/seed credentials, **every meaningful control** with real selectors + one-line purpose, and any **downstream page** the action affects (with URL and how to reach it). Return an ordered element+step list — not guesses.

### Phase 3 — Verify flows end-to-end

For each feature on the checklist, exercise the core flow: page loads clean, the action completes, the success state shows, no console/network errors. Broken → debug and apply the smallest safe fix (`systematic-debugging` if needed), re-verify. Can't fix → mark `BLOCKED`, continue with others. **No recording until every feature is verified or marked.**

### Phase 4 — Author flow file(s)

Copy `assets/example-flow.mjs` per feature and adapt: `h.explain(locator, text)` for every control from Phase 2 (including untouched ones), `h.narrate(...)` before each action step (the spoken line IS the caption — short and client-friendly), `h.caption(...)` only for labels that must NOT be read aloud, `h.glideClick`/`h.glideTo`/`h.type` for actions, `h.shot('<label>')` at milestones, `h.goto` downstream pages and explain the result, restore mutated data at the end. Write narrate/explain text as **plain string literals** wherever possible so the recorder can pre-synthesize it (dynamic lines still work — they're generated on the spot and can add a pause).

### Phase 5 — Record

Run the one-time tooling setup, then record per clip:

```bash
bash /abs/path/to/skills/using-my-presenter/assets/setup-tooling.sh
# only if narration was requested AND VoiceStudio isn't installed yet
# (after user confirmation — see the voiceover availability ladder):
bash /abs/path/to/skills/using-my-presenter/assets/setup-voicestudio.sh
```

```bash
CACHE_DIR="$HOME/.cache/client-demo-presentation"
CLIP_DIR="<out>/01_login"   # or "<out>/" itself for a single-feature demo

DEMO_MODULES="$CACHE_DIR" \
PLAYWRIGHT_BROWSERS_PATH="$CACHE_DIR/ms-browsers" \
  node /abs/path/to/skills/using-my-presenter/assets/demo-recorder.mjs \
    --base <base_url> --flow "$CLIP_DIR/flow.mjs" \
    --out "$CLIP_DIR" --name <feature>-demo [--voiceover]
```

Multi-clip: `01_login` first (only clip showing auth), then `02_<feature>`, `03_<feature>`… each going directly to the feature URL with the authenticated session reused (re-auth silently inside the flow if the recorder's fresh context requires it).

### Phase 6 — Per-clip verify

After each clip: recorder exited 0 (no `FLOW_ERROR`), `.mp4` exists (or `.webm` if ffmpeg missing), `screenshots/` populated, and no failed flow / broken selector / missing success state on video. Faulty → delete the clip dir, fix, re-verify, re-record. Only then start the next clip.

### Phase 7 — Deliver

- **Feature set:** write `$SESSION_DIR/MANIFEST.md` — date, base URL, server state, numbered clip index, verification/re-record status, any `BLOCKED` features with reasons.
- Report the output dir (and manifest) to the user.

## Flow Helpers

The flow file exports `default async function runFlow(page, h)`:

| Helper | Purpose |
|--------|---------|
| `h.goto(path)` | navigate (relative resolves against `--base`), waits networkidle; narration-gated |
| `h.caption(text)` | visual subtitle only — NOT spoken; narration-gated |
| `h.narrate(text)` | caption + spoken line; generates audio, holds the scene for its real duration, resolves when speech ends |
| `h.waitForNarration()` | resolves once active narration finishes (no-op when idle) |
| `h.glideClick(locator)` | glide cursor to element, then click (opts `{ms}`); narration-gated |
| `h.glideTo(locator)` | glide without clicking (opts `{ms}`); narration-gated |
| `h.highlight(locator)` | dim page + glowing ring on element (opts `{padding}`); narration-gated |
| `h.clearHighlight()` | hide spotlight |
| `h.explain(locator, text)` | glide + highlight + narrate under `--voiceover` (caption + read-pause otherwise); opts `{ms, read}`; never moves focus mid-narration |
| `h.type(locator, text)` | realistic per-key typing |
| `h.shot(label)` | numbered milestone screenshot `NNN_label.png` |
| `h.sleep(ms)` | pause for viewers (never a substitute for narration completion) |

## Resource Caps

Keep the recorder, browser, and TTS work inside bounds so nothing freezes or OOMs mid-run:

- **One thing at a time.** Never record two clips in parallel and never run concurrent TTS requests — all narration synthesis runs through a single-worker queue (one request in flight ever). Literal lines are pre-synthesized before and during the recording; on-demand lines overlap the previous narration's playback; the mux happens post-record.
- **Stay headless.** Headless Chromium is the default; `DEMO_HEADED` only when the user asks to watch — a headed browser costs meaningfully more.
- **Output is always 1920×1080 at 60fps.** Never drop the frame rate to save resources — smoothness is the deliverable. If a constrained machine struggles, the fix is serializing work (above), not lowering quality.
- **Bound every wait.** Server poll (30×2s), VoiceStudio API probe (~30×2s), navigation waits in flow files — every wait needs a timeout, never an unbounded block. `networkidle` waits are the usual freeze; prefer a bounded settle-wait in the flow.
- **Watchdog per clip.** If a single clip exceeds ~15 minutes, kill it, treat it as faulty (delete + fix + re-record), and report — a clip that runs that long is stuck, not thorough.
- **Check disk before recording.** Raw captures + mp4 + screenshots can be GBs per clip; verify free space first and delete faulty clip dirs immediately rather than letting them pile up.
- **Reap strays.** After a failed or killed run, check for orphaned `chromium`/`node`/`ffmpeg` processes and kill them before retrying — leaked processes are how a retry freezes too.
- **Optimize the `.mp4`, never the quality.** After recording, if the file is larger than it needs to be, re-encode once with `ffmpeg-static` using a CRF quality target instead of the recorder's default bitrate — e.g. `libx264 -crf 20 -preset slow -pix_fmt yuv420p -movflags +faststart` for maximum client compatibility (HEVC/`libx265 -crf 26` only when the recipient's player is known to support it). Drop the audio track entirely when no voiceover was requested. Visually identical output at a fraction of the size; verify the result still plays before deleting the larger intermediate.
- **Recurring crashes are a recorder fix, not a demo fix.** If Chromium dies on `/dev/shm` or OOMs, the standing fix is adding `--disable-dev-shm-usage` to the recorder's launch args — that changes the recorder itself, so raise it as an edit to `assets/demo-recorder.mjs` rather than working around it per demo.

## Runtime Notes

- Persistent tooling cache at `~/.cache/client-demo-presentation/` (overridable via `CLIENT_DEMO_CACHE_DIR`); setup scripts are idempotent and never touch project manifests or `.env`.
- Playwright records `.webm` natively; `ffmpeg-static` produces the `.mp4` (normalized to constant `--fps`, default 60) and muxes voiceover. Without ffmpeg, `.webm` is the deliverable.
- The `.mp4` composites the recording as a floating browser window (macOS chrome bar, live-URL pill, rounded corners, drop shadow) on a white canvas — composited in post, never covering content. Disable with `--no-chrome` / `DEMO_NO_CHROME=1`.
- Subtitles burn below the browser window in post; if ffmpeg is unavailable the recorder falls back to an in-page caption lane so `.webm` keeps captions.
- Off-screen targets scroll into view with smooth scrolling before the cursor glides; the spotlight auto-clears before every navigation.
- Flags also settable via env: `DEMO_BASE / DEMO_FLOW / DEMO_OUT / DEMO_NAME / DEMO_WIDTH / DEMO_HEIGHT / DEMO_FPS / DEMO_NO_CHROME / DEMO_HEADED / DEMO_VOICEOVER / DEMO_MUSIC / DEMO_MUSIC_* / DEMO_VO_* / VS_* / DEMO_AUDIO_* / DEMO_MODULES`. Run with no `--flow` for a placeholder open-only clip to verify setup.
- After a successful record, the raw capture and intermediate `.webm` are auto-cleaned — only `.mp4` + `screenshots/` remain.

## Deliverable Structure

Single feature:
```
<project shared dir>/docs/client-demo/20250620_143022_login/
├── login-demo.mp4
├── flow.mjs
└── screenshots/ (001_open.png …)
```

Feature set:
```
<project shared dir>/docs/client-demo/20250819_143022_<feature-set>/
├── MANIFEST.md
├── 01_login/    (login-demo.mp4, flow.mjs, screenshots/)
├── 02_pos-creation/  (…)
└── 03_dashboard/     (…)
```

## Completion Standard

- scope classified (single vs set); every feature verified end-to-end **before** recording
- base URL detected from env/config; server confirmed running (started if needed)
- every step captioned; cursor visibly moving; every meaningful control spotlight-explained; downstream result pages shown
- one clean clip per feature under the session dir; login shown once only
- every clip reviewed; faulty clips deleted and re-recorded; none contains a failed flow
- screenshots at each milestone; `.mp4` present (or `.webm` fallback), always 60fps, size-optimized via CRF re-encode where beneficial
- voiceover (if requested): verified audio stream, loudness-normalized, narration at natural speed with scenes held for measured duration, subtle ducked background bed (unless `--music none`), honest TTS disclosure
- feature set: `MANIFEST.md` written, `BLOCKED` features noted

## Blocked Conditions

Report `BLOCKED` (per feature, continuing others) when:

- the server can't be started/reached, or the feature/route can't be located
- required auth or demo credentials are unavailable
- a real product bug blocks the flow and can't be safely fixed
- no browser tooling can be installed (no Playwright, no network)

State the exact blocker and the minimum next action for that feature.
