---
name: using-my-presenter
description: Use when the user wants a client-presentable or stakeholder demo walkthrough of one or more features in a running app — either a real-browser screen recording (visible moving mouse cursor, spotlight highlights, on-screen caption narration, optional spoken voiceover, milestone screenshots, organized per-feature clips in one session directory) or a brief walkthrough document (.docx/.pdf) built from the same captioned screenshots, or both. Can generate docs from an existing demo session's screenshots. Verifies flows work before capturing. Triggers on "record a demo of X", "client demo", "demo the updates", "record all features", "verify and demo", "generate me docs", "demo docs", "walkthrough document", "documentation with screenshots", "demo like a product owner", "product walkthrough".
---

# Using My Presenter

## Overview

**Verify first, then record.** Produce polished, client-presentable walkthrough videos of the already-running app: real Chromium recordings with a **visible animated mouse cursor**, **spotlight highlighting** on narrated elements, **subtitle captions burned below the browser window**, **milestone screenshots**, and `.mp4` output composited as a **macOS-style floating browser window** on a white canvas. Optional `--voiceover` narrates through VoiceStudio — audio-driven: each `h.narrate()` holds the scene for its measured speech duration, so a spoken line always finishes before the next step begins. Narration lines are fully pre-synthesized before the camera rolls (bounded pre-roll), so speech runs continuously with only a small beat gap between lines — and cursor/spotlight mechanics overlap that gap instead of freezing through it.

Two scales, one pipeline:

- **Single feature** → verify that flow, record one clip.
- **Feature set** ("demo the updates") → verify every feature end-to-end, record each as a **separate numbered clip** under one session directory with a `MANIFEST.md` index.

Docs are the second deliverable shape: the same verified flow + milestone screenshots become a brief `.docx`/`.pdf` walkthrough (title + date/base URL, one section per feature, one captioned figure per shot) via `assets/make-docs.mjs`. Docs work **standalone** (screenshots captured with `--screens-only` — no video), **alongside** a recording, or **retroactively** from an existing session dir's `screenshots/` + `shots.json` without re-running the flow.

Every demo starts with a **product-owner pass**: before touching a single feature, write `PRODUCT_BRIEF.md` at the session root — what the product is, who uses it, the domain vocabulary, the actor/role map, and the key journeys with the business outcome each proves. Feature exploration, narration wording, clip order, and docs metadata all draw from that brief — the demo tells the product's story in the product's own language, not a mechanical click-path.

A demo of a broken feature is worse than no demo. This skill **does** fix flow-blocking defects found during verification (smallest safe fix, re-verify); it does not do general QA — that's `using-my-qa`. If a defect can't be safely fixed, mark that feature `BLOCKED` and continue with the rest.

Core principle: a plain Cypress / Playwright-MCP capture records only the page viewport (no OS cursor), so it looks like a "preview" with values changing on their own. To get a demo a client can follow, the bundled recorder injects a moving cursor, spotlight, and caption bar.

## When to Use

- a client / stakeholder demo video of a feature or feature set
- a screen recording with a visible mouse moving between elements
- a narrated walkthrough with subtitle/caption instructions per step, or spoken voiceover
- a brief walkthrough document (.docx/.pdf) with captioned screenshots — alongside a recording or on its own
- "present how to do X", "record a demo of X", "demo the updates", "record all features", "verify and demo"
- "generate me docs", "demo docs", "walkthrough document", "documentation of the demo" — including docs built from an existing demo session's screenshots
- organized per-feature clips grouped in one directory for review/recovery

Do NOT use when:

- the user wants validation/QA or end-to-end test authoring with no demo → use `using-my-qa`
- the user wants bug fixing only, no recording → use `systematic-debugging`
- the user wants a bare screenshot grab with no walkthrough structure (a docs request produces a structured walkthrough document, not a single capture)

## Core Rules

- **Verify before recording.** Never record a flow that hasn't been confirmed working end-to-end: page loads, API requests succeed, expected success state appears, no console errors.
- **Every take pre-flights itself.** The recorder automatically dry-runs the exact flow file as a smoke pass — real selectors, real data, real clicks, no video/voiceover — before the camera rolls: a flow error aborts the take; health findings (non-OK API responses, failed requests, console errors, page errors) are echoed + hoisted to `preflight-report.json` and the take proceeds. Review them; the same monitoring writes `health-report.json` on the take itself. `--smoke` runs the same pass standalone for iterating on fixes; `--no-preflight` skips it only for flows that can't safely run twice.
- **Flows must be safe to run twice.** The automatic pre-flight already walks the flow — mutating flows must restore their data at the end, or the real take can fail a validation (e.g. uniqueness) that pre-flight passed.
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
- **Docs are a first-class deliverable.** "Generate me docs" produces `demo-docs.docx` + `demo-docs.pdf` from the milestone screenshots — same verify-first pipeline, captured with `--screens-only` (no video). Video + docs together = normal record, then docs build.
- **Reuse existing screenshots read-only.** When the user points at a previous session dir (or asks for docs after a recording), build docs straight from its `screenshots/` + `shots.json` — never re-run the flow just to regenerate identical PNGs.
- **`shots.json` rides with every capture** (all modes): per-shot `{n, file, label, caption, url}` — the doc captions each figure with the subtitle that was on screen. Older sessions without it fall back to humanized filename labels.
- **Docs stay brief.** Title + date/base URL, one section per feature, numbered figure + one-line caption per screenshot. No added prose — depth belongs to the video.
- **Understand the product before any feature work.** Write `PRODUCT_BRIEF.md` once per session (Phase 2) — product one-liner, actors/roles, domain glossary, feature→route map, key journeys + the outcome each proves, recommended demo order. Per-feature exploration, narration, clip order, and docs metadata all consume it.
- **Narrate outcomes, not mechanics.** Every narrate/explain line says what the user accomplishes, in the product's own vocabulary from the glossary — "the order is ready to send", never "a modal opens". Never fabricate ROI, metrics, or claims the product doesn't make itself.

### Voiceover rules

- **Default: no voiceover.** Record silently (captions only) unless the user explicitly asks for spoken narration; pass `--voiceover` / `DEMO_VOICEOVER=1` only then. Caption voiceover only — no app audio, no invented music.
- **VoiceStudio is the ONLY narration engine** — a local app exposing an OpenAI-compatible TTS API at `http://localhost:3900` (`VS_BASE_URL` to relocate). There is no Piper/espeak/other fallback.
- **WSL2:** when `VS_BASE_URL` is unset the recorder probes `localhost` first, then the WSL2 default gateway (the Windows host) — VoiceStudio running on Windows serves WSL2 projects with zero config. Running VoiceStudio *inside* WSL2 needs WSLg (Electron GUI); prefer the Windows install.
- **Availability ladder — walk it BEFORE recording with `--voiceover`:**
  1. Probe `curl -sf $VS_BASE_URL/v1/audio/voices`.
  2. Down but installed → launch `VoiceStudio` (`~/.local/bin/VoiceStudio`) in the background and poll until the API responds (~30×2s; first boot downloads its runtime and can take minutes).
  3. Not installed → **ask the user whether to install VoiceStudio**; on confirmation run `assets/setup-voicestudio.sh` (latest `debpalash/VoiceStudio` GitHub release → `~/.local/bin`), then launch and poll.
  4. Still unreachable, install declined/failed → record **without** narration — the voiceover request is disregarded (the recorder does this itself); say so in the report. Never substitute another engine.
- **One voice for the whole video.** Default `"The Companion"` profile (`VS_VOICE=fc52c689`); change only when the user names a different voice. `VS_SPEED` sets pace (default `1.3` — a brisk conversational rate); `VS_MODEL`, `VS_SEED`, `VS_INSTRUCTIONS` tune the speech request.
- **Audio-driven pacing — measured duration is authoritative.** Before the camera rolls, the recorder statically extracts every literal `h.narrate()`/`h.explain()` line from the flow source, pre-synthesizes them through a single-worker VoiceStudio queue (started during browser setup), and holds the recording start until the queue drains — bounded by `DEMO_VO_PREROLL_MS` (default 120s; `0` reverts to ensuring only the first line). Off-camera synthesis time never appears in the video, so spoken lines land back-to-back with only `DEMO_VO_GAP_MS` between them (default 350). A line that isn't a plain string literal still works — it's synthesized on demand, overlapped with the previous narration where possible, and logged as an on-camera stall. `h.narrate(text)` then measures the REAL audio length, shows the caption, and holds the scene until the speech has finished. Gated helpers (`goto`, `glideTo`, `glideClick`, `highlight`, `caption`, `explain`) release the instant speech ends — never mid-word — while only the next spoken line holds the breath gap, so cursor and spotlight mechanics overlap the gap instead of freezing through it. A long narration simply extends the scene — speech is never sped up, trimmed, or time-stretched to fit a window, and the mux contains no `atempo`/tempo filters (only `adelay` + `amix` + `loudnorm`). `DEMO_VO_TAIL_MS` (default 400) keeps the last word inside the capture.
- **`h.narrate(text)` is the spoken helper; `h.caption(text)` is visual-only.** A caption alone does NOT produce speech or guarantee audio sync — use `narrate()` for every line that must be read aloud. `h.waitForNarration()` resolves once active narration finishes (no-op when idle); fixed `h.sleep()` padding is never a substitute for narration completion.
- **Background music is automatic with `--voiceover`** — no extra flag. The bundled bed is a deterministic upbeat pattern synthesized by ffmpeg at mux time (`aevalsrc`: plucked 8th-note arpeggios cycling C–G–Am–F at 120 BPM over a quarter-note bass pulse — no external file, no licensing issues, always seamless). It is trimmed to the clip duration, fades in 1.5s / out 2s, and stays well under the narration: sidechain-ducked hard while speech plays and ~18dB+ below it even in the pauses — the voiceover is always the dominant, clean signal. **`--music none`** disables it; **`--music /path/to/track.mp3`** substitutes a custom bed (missing file → warns and falls back to the bundled bed; custom files loop via `-stream_loop`). Tune level with `DEMO_MUSIC_GAIN` (linear, default 0.1) and fades with `DEMO_MUSIC_FADE_IN`/`DEMO_MUSIC_FADE_OUT`. Without `--voiceover` there is no audio chain — recordings stay silent as before; music is never added to a non-narrated clip. Troubleshooting: bed too loud/quiet → adjust `DEMO_MUSIC_GAIN`; voice drowned → lower gain toward 0.05 before touching `VS_*`.
- Verify `AUDIO_STREAM=` in recorder logs and probe the final file (`ffmpeg -i <video> -map 0:a:0 -f null -`).
- The mux applies single-pass EBU R128 loudness normalization (`-16 LUFS`, `-1.5 dBTP`, `7 LU`). Override only via `DEMO_AUDIO_TARGET_LUFS` / `DEMO_AUDIO_MAX_TRUE_PEAK` / `DEMO_AUDIO_TARGET_LRA` when the delivery platform requires it — no guessed `dynaudnorm`/volume boosts.
- VoiceStudio is synthetic TTS — natural-sounding but not human. Never claim human/non-AI narration; that claim requires a supplied human recording.

## Workflow

### Phase 0 — Resolve scope, URL, output dir

1. **Deliverable + feature checklist.** Classify intent: **video** ("record a demo"), **docs** ("generate me docs", "walkthrough document"), or **both** ("record it and give me docs"). For docs-only requests, first check `<project shared dir>/docs/client-demo/` for an existing session dir with the needed screenshots — reuse skips capture entirely (jump to Phase 8 docs build; confirm the dir with the user if ambiguous). For a single feature, capture it and the app's base URL (ask only if it can't be inferred). For a set, enumerate every important feature up front — this becomes the checklist and order.
2. **Detect the base URL** from `.env.local`, `.env.development`, `.env`, `package.json` scripts, then app config (`vite.config.*`, `next.config.*`). Fall back to `http://localhost:3000` only if nothing is found. Note frontend vs backend ports if split.
3. **Output dir:** `<project shared dir>/docs/client-demo/<YYYYMMDD_HHMMSS>_<slug>/` (Shared Workspace Artifacts in global rules; `date +%Y%m%d_%H%M%S`). Slug = feature name, or a concise kebab-case feature-set summary (`[a-z0-9-]`, ≤60 chars, else `demo-session`).

### Phase 1 — Server health check

`curl -sf <base_url>`. If unreachable, start the dev server (`pnpm dev` or the project's equivalent — check `package.json`; monorepo: `pnpm --filter <pkg> dev`; split apps: start frontend and backend both). Poll the base URL until reachable (30×2s). Still down → `BLOCKED`.

### Phase 2 — Understand the product, then the feature

**Product brief (once per session).** Dispatch a read-only sub-agent to write `$SESSION_DIR/PRODUCT_BRIEF.md` — a product owner's picture of the app, kept to ~1 page. Sources, in order of signal: `README*` and `docs/` (positioning, glossary), the running app's landing/nav/footer copy, `package.json` name/description, route structure (`app/`, `pages/`, router files), DB schema and model names (`prisma/schema.prisma`, migrations, `models/` — entities and statuses ARE the vocabulary), and existing E2E/spec files (they encode real user journeys). Contents:

- **One-liner** — what the product is and who it's for.
- **Actors/roles** — who logs in (admin, staff, customer…) and what each cares about.
- **Glossary** — 5–15 domain terms exactly as the product spells them (entities, statuses, actions). Narration must use these words, not generic UI vocabulary.
- **Feature → route map** — nav structure and how features connect.
- **Key journeys** — the 2–5 end-to-end flows a client must see, each with the business outcome it proves and the downstream page where the result surfaces.
- **Demo order** — the narrative arc for a feature set (context → core flow → where it lands → reporting), not just checklist order.

Already have a `PRODUCT_BRIEF.md` from an earlier session for the same app? Reuse it after a freshness skim (routes/schema changed?) rather than rewriting.

**Per-feature explore.** Dispatch a read-only sub-agent — given `PRODUCT_BRIEF.md` as context — to locate in the repo: route/page/component, exact entry URL, required auth/seed credentials, **every meaningful control** with real selectors + one-line purpose phrased in glossary terms, and any **downstream page** the action affects (with URL and how to reach it). Return an ordered element+step list — not guesses.

### Phase 3 — Verify flows end-to-end

For each feature on the checklist, exercise the core flow: page loads clean, the action completes, the success state shows, no console/network errors. Broken → debug and apply the smallest safe fix (`systematic-debugging` if needed), re-verify. Can't fix → mark `BLOCKED`, continue with others. **No recording until every feature is verified or marked.** This verifies the *journey*; Phase 5 smoke-tests the *scripted flow file* — both gates apply.

### Phase 4 — Author flow file(s)

Copy `assets/example-flow.mjs` per feature and adapt: `h.explain(locator, text)` for every control from Phase 2 (including untouched ones), `h.narrate(...)` before each action step (the spoken line IS the caption — short and client-friendly), `h.caption(...)` only for labels that must NOT be read aloud, `h.glideClick`/`h.glideTo`/`h.type` for actions, `h.shot('<label>')` at milestones, `h.goto` downstream pages and explain the result, restore mutated data at the end. Write narration in the product's own vocabulary — the `PRODUCT_BRIEF.md` glossary — framed as what the user accomplishes, and order feature-set clips per the brief's demo arc. Write narrate/explain text as **plain string literals** wherever possible so the recorder can pre-synthesize it before the camera rolls (dynamic lines still work — they're generated on the spot, add a pause, and get logged as on-camera stalls).

### Phase 5 — Pre-flight check (automatic smoke pass)

No separate step needed: when Phase 6 runs the recorder, it **automatically dry-runs the flow first** — a child `--smoke` pass with the same base URL and flow. Watch its output before the take:

- `PREFLIGHT=CLEAN` → take proceeds, nothing to review.
- `PREFLIGHT=<n>_FINDINGS` → take still proceeds, but `SMOKE_FINDING` lines + `preflight-report.json` detail every non-OK API response, failed request, console error, and page error (deduped, same-origin flagged). Same-origin API ≥400, failed requests, page errors → fix the cause (demo data that trips validation, stale selector, backend bug) and re-run; third-party noise (analytics, favicon 404) may be waived with a note in `MANIFEST.md`.
- `PREFLIGHT_FAILED` / non-zero exit → the take was aborted before the camera rolled. Fix the flow — a flow that can't finish a dry run will never produce a clean take. Can't fix → mark the feature `BLOCKED`, continue with the rest.

To iterate on fixes without burning takes, run the same pass standalone:

```bash
DEMO_MODULES="$CACHE_DIR" \
PLAYWRIGHT_BROWSERS_PATH="$CACHE_DIR/ms-browsers" \
  node /abs/path/to/skills/using-my-presenter/assets/demo-recorder.mjs \
    --base <base_url> --flow "$CLIP_DIR/flow.mjs" \
    --out "$CLIP_DIR" --name <feature>-smoke --smoke
```

`SMOKE_REPORT=CLEAN|<n>_FINDINGS|FLOW_ERROR`; exit 0 whenever the flow completes — the **findings are the gate**, read them. The pre-flight mutates the same data a take would, so the flow's restore step must leave the app ready for the real run; only use `--no-preflight` for flows that genuinely can't run twice (unrestorable mutations), and note it in `MANIFEST.md`.

### Phase 6 — Record

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

Docs-only runs add `--screens-only`: no video is recorded or composited — the deliverables are `screenshots/` + `shots.json` (per-shot caption/url metadata). `--voiceover` is disregarded in screens-only mode. Every run — record, screens-only, or smoke — writes `health-report.json` with the non-OK responses / failed requests / console errors / page errors observed during it.

Multi-clip: `01_login` first (only clip showing auth), then `02_<feature>`, `03_<feature>`… each going directly to the feature URL with the authenticated session reused (re-auth silently inside the flow if the recorder's fresh context requires it).

### Phase 7 — Per-clip verify

After each clip: recorder exited 0 (no `FLOW_ERROR`), `HEALTH=CLEAN` (or `health-report.json` findings reviewed and accounted for — a clean smoke does not guarantee a clean take), `.mp4` exists (or `.webm` if ffmpeg missing — skipped under `--screens-only`), `screenshots/` populated, `shots.json` written with captions, and no failed flow / broken selector / missing success state on video. Faulty → delete the clip dir, fix, re-verify, re-record. Only then start the next clip.

### Phase 8 — Deliver

- **Docs requested (or reusing an existing session):** run `assets/make-docs.mjs` on the session dir (feature set → sections per clip) or clip dir (single feature). Emits `demo-docs.docx` + `demo-docs.pdf` (default `both`; `--format docx|pdf` narrows; `--title`/`--subtitle`/`--out` override — title it from `PRODUCT_BRIEF.md`'s product name + the demo scope, e.g. `"Acme POS — Staff ordering walkthrough"`). Verify the outputs open validly (docx is a zip with `word/document.xml` + `word/media/*`; pdf starts `%PDF`) and every shot appears ordered + captioned.

```bash
DEMO_MODULES="$CACHE_DIR" \
PLAYWRIGHT_BROWSERS_PATH="$CACHE_DIR/ms-browsers" \
  node /abs/path/to/skills/using-my-presenter/assets/make-docs.mjs \
    --dir "<out-or-existing-session>" [--title "..."] [--format both]
```

- **Feature set:** write `$SESSION_DIR/MANIFEST.md` — date, base URL, server state, numbered clip index, smoke-report + verification/re-record status (incl. any waived findings), any `BLOCKED` features with reasons.
- Report the output dir (and manifest, docs) to the user.

## Flow Helpers

The flow file exports `default async function runFlow(page, h)`:

| Helper | Purpose |
|--------|---------|
| `h.goto(path)` | navigate (relative resolves against `--base`), waits networkidle bounded by `DEMO_NAV_TIMEOUT_MS` (default 15s, warn+continue on starved idle); narration-gated |
| `h.caption(text)` | visual subtitle only — NOT spoken; narration-gated |
| `h.narrate(text)` | caption + spoken line; generates audio, holds the scene for its real duration, resolves when speech ends |
| `h.waitForNarration()` | resolves once active narration finishes (no-op when idle) |
| `h.glideClick(locator)` | glide cursor to element, then click (opts `{ms}`); narration-gated |
| `h.glideTo(locator)` | glide without clicking (opts `{ms}`); narration-gated |
| `h.highlight(locator)` | dim page + glowing ring on element (opts `{padding}`); narration-gated |
| `h.clearHighlight()` | hide spotlight |
| `h.explain(locator, text)` | glide + highlight + narrate under `--voiceover` (caption + read-pause otherwise); opts `{ms, read}`; never moves focus mid-narration |
| `h.type(locator, text)` | realistic per-key typing |
| `h.shot(label)` | numbered milestone screenshot `NNN_label.png` + `shots.json` entry (label, live caption, url) |
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
- Flags also settable via env: `DEMO_BASE / DEMO_FLOW / DEMO_OUT / DEMO_NAME / DEMO_WIDTH / DEMO_HEIGHT / DEMO_FPS / DEMO_NO_CHROME / DEMO_HEADED / DEMO_VOICEOVER / DEMO_SCREENS_ONLY / DEMO_SMOKE / DEMO_NO_PREFLIGHT / DEMO_MUSIC / DEMO_MUSIC_* / DEMO_VO_* / DEMO_NAV_TIMEOUT_MS / VS_* / DEMO_AUDIO_* / DEMO_MODULES`. Run with no `--flow` for a placeholder open-only clip to verify setup.
- **Every take auto-preflights.** Before the camera rolls, the recorder spawns itself with `--smoke` (headless, same flow/base/viewport) into `<out>/.preflight/`: child exits non-zero → `PREFLIGHT_FAILED`, parent aborts; findings → `SMOKE_FINDING` echo + `<out>/preflight-report.json` + `PREFLIGHT=<n>_FINDINGS|CLEAN`, take proceeds. Costs one extra flow run (~the flow's duration) per clip. `--no-preflight` skips it — only for flows that can't run twice.
- `--smoke` standalone is the same pass for iterating on fixes: rides the screens-only pipeline (no video/voiceover/chrome mockup) — prints `SMOKE_FINDING` lines + `SMOKE_REPORT=CLEAN|<n>_FINDINGS|FLOW_ERROR`. Exit code still reflects flow completion only; findings are a human/agent review gate.
- Every run writes `health-report.json` next to the output: `mode`, `flowError`, `counts`, and deduped `httpErrors` / `requestFailures` (benign `ERR_ABORTED` flagged) / `consoleErrors` / `pageErrors` with `sameOrigin` flags. Console `HEALTH=CLEAN|<n>_FINDINGS|FLOW_ERROR` + `HEALTH_JSON=` lines summarize it.
- `shots.json` is written next to `screenshots/` in every mode (per-shot label, live caption, page URL) — `assets/make-docs.mjs` consumes it for figure captions. `.docx` generation needs the `docx` dep (installed into the cache by `setup-tooling.sh`); `.pdf` prints generated HTML through the cached Chromium — no extra deps.
- After a successful record, the raw capture and intermediate `.webm` are auto-cleaned — only `.mp4` + `screenshots/` + `shots.json` remain.

## Deliverable Structure

Single feature:
```
<project shared dir>/docs/client-demo/20250620_143022_login/
├── PRODUCT_BRIEF.md      (product-owner context — reused next session)
├── login-demo.mp4        (absent under --screens-only)
├── flow.mjs
├── shots.json            (per-shot captions/urls — doc source)
├── health-report.json    (errors observed during the take — every mode)
├── preflight-report.json (errors observed during the automatic pre-flight)
├── demo-docs.docx/.pdf   (docs requested)
└── screenshots/ (001_open.png …)
```

Feature set:
```
<project shared dir>/docs/client-demo/20250819_143022_<feature-set>/
├── PRODUCT_BRIEF.md
├── MANIFEST.md
├── demo-docs.docx/.pdf   (docs requested — sections per clip)
├── 01_login/    (login-demo.mp4, flow.mjs, shots.json, health-report.json, preflight-report.json, screenshots/)
├── 02_pos-creation/  (…)
└── 03_dashboard/     (…)
```

## Completion Standard

- scope classified (single vs set); every feature verified end-to-end **before** recording
- every take pre-flighted automatically — `PREFLIGHT=CLEAN`, or findings reviewed/fixed/re-run, or benign ones explicitly waived in `MANIFEST.md`; mutating flows confirmed to restore their data so the real take re-runs clean
- `PRODUCT_BRIEF.md` written once (or reused fresh) at the session root; narration uses the product's own vocabulary; feature-set clips ordered as a story arc, not checklist order
- base URL detected from env/config; server confirmed running (started if needed)
- every step captioned; cursor visibly moving; every meaningful control spotlight-explained; downstream result pages shown
- one clean clip per feature under the session dir; login shown once only
- every clip reviewed — including `health-report.json` from the take itself; faulty clips deleted and re-recorded; none contains a failed flow
- screenshots at each milestone; `.mp4` present (or `.webm` fallback), always 60fps, size-optimized via CRF re-encode where beneficial
- voiceover (if requested): verified audio stream, loudness-normalized, narration at natural speed with scenes held for measured duration, subtle ducked background bed (unless `--music none`), honest TTS disclosure
- docs (if requested): `demo-docs.docx` + `demo-docs.pdf` present and valid, `shots.json` captured, every screenshot ordered + captioned, one section per feature; reused sessions built from existing screenshots, not re-captured
- feature set: `MANIFEST.md` written, `BLOCKED` features noted

## Blocked Conditions

Report `BLOCKED` (per feature, continuing others) when:

- the server can't be started/reached, or the feature/route can't be located
- required auth or demo credentials are unavailable
- a real product bug blocks the flow and can't be safely fixed
- no browser tooling can be installed (no Playwright, no network)

State the exact blocker and the minimum next action for that feature.
