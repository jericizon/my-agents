---
name: client-demo-presentation
description: Use when the user wants a client-presentable or stakeholder demo walkthrough video of a feature in a running app — a real-browser screen recording with a visible moving mouse cursor, on-screen subtitle/caption instructions, optional spoken voiceover, or consistent/natural-sounding demo audio (e.g. "present how to log in", "record a demo of checkout", "make a client demo of X").
---

# Client Demo Presentation

## Overview

Produce a polished, client-presentable walkthrough of one feature in the already-running
app: a real Chromium screen recording with a **visible animated mouse cursor**, **on-screen
subtitle captions** narrating each step, **milestone screenshots**, and **one whole demo
video** (`.mp4` plus `.webm`). With `--voiceover`, the same captions become a synchronized
spoken voiceover track in the final video.

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
- **Explain the whole page, not just the happy path.** Before (or while) performing the task,
  walk every meaningful control on the page — inputs, toggles, dropdowns, tabs, secondary
  buttons — with `h.explain(locator, text)`, even controls the flow itself never touches.
  A viewer should come away understanding the whole page, not just the three fields that
  were filled in.
- **Highlight what's being narrated.** Whenever a caption discusses a specific element, that
  element must have the spotlight box on it (`h.explain`, or `h.highlight` + `h.caption`
  directly) so the viewer's focus lands exactly where the narration is pointing.
- **Follow through to downstream/related pages.** If completing the action changes or creates
  content that renders somewhere else (e.g. an admin/CMS editor publishing a page that then
  appears on the public site), the demo must navigate to that resulting page and show/explain
  the outcome there before the video ends — not just the "Saved!" toast on the editor.
- Capture a **screenshot at every key milestone** (open, each explained element, each key
  action, and the final result on every page involved — including downstream pages).
- Produce **one whole video** of the full walkthrough (`.mp4` preferred, `.webm` always).
- Save all artifacts under `docs/client-demo/<timestamp>_<feature>/`.
- Use the bundled recorder at `assets/demo-recorder.mjs`. **Do not edit the recorder for an
  individual demo** — only write a project-specific flow file.
- If the user requests spoken narration, pass `--voiceover` (or set `DEMO_VOICEOVER=1`). The
  recorder reads every non-empty `h.caption(...)` call into the final video; this is caption
  voiceover only, not app/browser audio. Do not invent background music or claim audio exists
  without verifying the output stream.
- The voiceover mux applies single-pass EBU R128 loudness normalization to the complete assembled
  track: `-16 LUFS` integrated loudness, `-1.5 dBTP` maximum true peak, and `7 LU` loudness range.
  Override these numeric targets with `DEMO_AUDIO_TARGET_LUFS`, `DEMO_AUDIO_MAX_TRUE_PEAK`, and
  `DEMO_AUDIO_TARGET_LRA` only when the delivery platform requires different mastering.
- For a clear, free, more natural-sounding synthetic voice, use the local Piper engine with the
  `en_US-lessac-high` model rather than the platform default synthesizer. Run
  `assets/setup-voiceover.sh` once, then apply its printed exports before recording. Its profile
  uses a normal speaking pace, mild variation, short sentence pauses, and final-track loudness
  normalization. Tune it with `DEMO_TTS_LENGTH_SCALE`, `DEMO_TTS_NOISE_SCALE`,
  `DEMO_TTS_NOISE_W_SCALE`, `DEMO_TTS_SENTENCE_SILENCE`, and `DEMO_TTS_VOLUME`.
- Piper is neural TTS, so it remains synthetic even when it sounds natural. Never describe it as
  a human or non-AI recording. A genuinely human voice requires a supplied human narration track;
  do not fabricate one or claim that audio filters can convert TTS into a human recording.
- Treat existing recordings as read-only by default. Do not assume a directory, select files by a
  wildcard, or overwrite an artifact. If a user explicitly requests post-processing, confirm the
  exact input and write a separately named output after a metadata/loudness check.
- For this recorder's generated voiceover, use the final `loudnorm` stage as the canonical level
  correction. Do not add time-based volume boosts or `dynaudnorm` by guesswork: they can create
  pumping and less-natural speech. Choose another filter only when measured source behavior and
  a separate review justify it.
- If voiceover is requested, require a local TTS engine and `ffmpeg-static`; report `BLOCKED`
  before recording if either prerequisite is unavailable. The recorder supports Piper, `say` on
  macOS, `espeak-ng`/`espeak` on Linux, and PowerShell/SAPI on Windows. Set `DEMO_TTS_BIN` only
  when it points to the selected compatible local engine. Do not silently replace an explicitly
  selected Piper engine with a lower-quality fallback.
- If the demo mutates data, restore it at the end so the environment is left unchanged.
- **Render inline in chat.** After recording, if `$JHECKBOT_MEDIA_DIR` is set, copy the
  final `.mp4` to `$JHECKBOT_MEDIA_DIR/capture.mp4` so the video renders inline in the chat
  reply. This applies to any project — the env var is the contract, not the project.
- This skill does not fix product bugs. If the flow is blocked by a real defect, stop and
  report `BLOCKED`; hand off to `comprehensive-qa-testing` for fixing.

## Workflow (multi-phase sub-agents)

The main agent orchestrates and owns the final deliverable. Dispatch sub-agents for the
self-contained phases, in order:

1. **Resolve the request.** Capture the feature being demoed and the base URL of the running
   app (ask the user only if it cannot be inferred). Compute the output directory:
   `docs/client-demo/<YYYYMMDD_HHMMSS>_<feature_slug>/` (use `date +%Y%m%d_%H%M%S`).

2. **Phase A — Explore the page (explore sub-agent).** Dispatch a read-only sub-agent to
   locate, in the repo, the route/page/component for the requested feature, the exact entry
   URL/path, required auth, and any seed/demo credentials. Crucially, it must enumerate
   **every meaningful control on the page** — not only the ones needed for the happy path:
   each input, dropdown, toggle, tab, secondary button/link — with its real selector (label,
   role, test-id) and a one-sentence description of what it does/why it matters. It must also
   identify any **downstream/related page** the action affects — e.g. a CMS admin editor that
   publishes content onto a separate public-facing route — with that page's URL/path and how
   to reach it (nav path or direct route) once the action completes. Return a concrete,
   ordered list of UI elements + steps with real selectors — not guesses.

3. **Phase B — Author the flow + narration (general sub-agent).** Using Phase A's findings,
   copy `assets/example-flow.mjs` to `<out>/flow.mjs` (or a temp path) and adapt it:
   - `h.explain(locator, text)` for every control identified in Phase A, including ones the
     flow doesn't act on — this glides the cursor to it, draws the spotlight highlight, and
     narrates its purpose
   - `h.glideClick` / `h.glideTo` for the actual action steps, each preceded by `h.caption(...)`
   - `h.type` for realistic typing
   - `h.shot('<label>')` at every milestone, including each explained element and the final result
   - if Phase A found a downstream/related page, `h.goto` there after the action completes and
     `h.explain`/`h.highlight` the new/changed content before the closing shot
   - prove the final result on screen (on every page involved), then restore any mutated data
   The narration captions ARE the demo script; keep them short and client-friendly.

4. **Phase C — Record (the main agent runs this; see Runtime Setup).** Run the reusable
   tooling setup once, then run `assets/demo-recorder.mjs` against the running app with the
   Phase B flow, outputting into the `docs/client-demo/<timestamp>_<feature>/` directory.

5. **Verify the deliverable.** Confirm the directory contains the `.mp4`/`.webm` video, the
   numbered screenshots under `screenshots/`, and that the recorder exited 0 (no `FLOW_ERROR`).
   If the flow errored, fix the flow file (selectors/timing) and re-record. Then **copy the
   final `.mp4` to `$JHECKBOT_MEDIA_DIR/capture.mp4`** if that env var is set, so the video
   renders inline in the chat reply. Report the artifact paths to the user.

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

For the recommended free neural voiceover, install the pinned local Piper runtime and the
high-quality `en_US-lessac-high` voice model:

```bash
bash /abs/path/to/skills/client-demo-presentation/assets/setup-voiceover.sh
```

The setup script prints exports for `DEMO_TTS_ENGINE`, `DEMO_TTS_BIN`, `DEMO_TTS_MODEL`, the
natural presentation profile, and the loudness targets. Apply those exports in the shell that
runs the recorder, and add them to your shell profile if you want the Piper voice selected for
future sessions. The first run needs network access for PyPI and the voice download; recording is
local after setup. The script installs `piper-tts==1.7.0` into `~/.cache/client-demo-presentation/piper`
and downloads the voice into the same cache; it does not modify the project package manifest or
any `.env` file.

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

Add `--voiceover` to that command (or set `DEMO_VOICEOVER=1`) when the client needs spoken
narration generated from the captions. Voiceover is created after the browser recording so
caption timing stays tied to the recorded flow.

Notes:
- Playwright records `.webm` natively (no system ffmpeg). `ffmpeg-static` creates the `.mp4`
  and, in voiceover mode, muxes the generated audio into both video formats. Without
  voiceover, if it is missing, the video-only `.webm` is the deliverable.
- Piper is the recommended free local neural engine: it requires no API key or paid service and
  reads caption text from stdin into a WAV file. The setup script does not install OS packages.
- The default `en_US-lessac-high` voice is a single-speaker, 22,050 Hz US English voice. Review
  its model-card terms before distribution. The pinned `piper-tts==1.7.0` runtime is
  GPL-3.0-or-later. “Free” means no API or usage charge here, not unrestricted licensing.
  Sources: https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/lessac/high/MODEL_CARD
  and https://pypi.org/project/piper-tts/
- The final voiceover track is resampled to 48 kHz and uses FFmpeg's dynamic `loudnorm` filter,
  targeting `-16 LUFS`, `-1.5 dBTP`, and `7 LU` by default. See
  https://ffmpeg.org/ffmpeg-filters.html#loudnorm.
- Flags also settable via env: `DEMO_BASE / DEMO_FLOW / DEMO_OUT / DEMO_NAME / DEMO_WIDTH /
  DEMO_HEIGHT / DEMO_HEADED / DEMO_VOICEOVER / DEMO_TTS_ENGINE / DEMO_TTS_BIN /
  DEMO_TTS_MODEL / DEMO_AUDIO_TARGET_LUFS / DEMO_AUDIO_MAX_TRUE_PEAK / DEMO_AUDIO_TARGET_LRA /
  DEMO_TTS_LENGTH_SCALE / DEMO_TTS_NOISE_SCALE / DEMO_TTS_NOISE_W_SCALE /
  DEMO_TTS_SENTENCE_SILENCE / DEMO_TTS_VOLUME`. `DEMO_TTS_VOICE` is setup-only: it chooses the
  model downloaded by `setup-voiceover.sh`, which then prints the required `DEMO_TTS_MODEL`.
  Setup cache overrides are `CLIENT_DEMO_CACHE_DIR`, `CLIENT_DEMO_PIPER_DIR`,
  `DEMO_TTS_DATA_DIR`, and `PYTHON_BIN`. Set `DEMO_MODULES` if running the recorder from a dir
  other than where `node_modules` was installed.
- Run with no `--flow` to record a placeholder open-only clip that verifies the setup. It
  includes voiceover only when a caption is supplied by the flow.
- Voiceover segments start at their corresponding caption timestamps. Leave enough `h.sleep(...)`
  after the final caption for the generated speech to finish before recording stops; split long
  final captions or increase the pause instead of trimming the audio.
- When voiceover is enabled, confirm the recorder logs `AUDIO_STREAM=` for the final output and
  probe the file with `ffmpeg -v error -i <video> -map 0:a:0 -f null -`. For a meaningful loudness
  check, run `-af loudnorm=I=-16:TP=-1.5:LRA=7:linear=false:print_format=json` on the final file
  and listen through the full track.

## Flow Helpers

The flow file exports `default async function runFlow(page, h)` and uses:

| Helper | Purpose |
|--------|---------|
| `h.goto(path)` | navigate (relative resolves against `--base`), waits networkidle |
| `h.caption(text)` | set the on-screen subtitle bar (the narration script); with `--voiceover`, the same text is spoken |
| `h.glideClick(locator)` | glide the visible cursor to the element, then click |
| `h.glideTo(locator)` | glide the cursor to the element without clicking |
| `h.highlight(locator)` | draw the pulsing spotlight box around an element's bounding rect |
| `h.clearHighlight()` | hide the spotlight box |
| `h.explain(locator, text)` | glide + highlight + caption + read-pause — the "explain this control" beat |
| `h.type(locator, text)` | realistic per-key typing |
| `h.shot(label)` | capture numbered milestone screenshot `NNN_label.png` |
| `h.sleep(ms)` | pause so viewers can read the screen |

See `assets/example-flow.mjs` for a complete login walkthrough template.

## Deliverable Structure

```
docs/client-demo/
└── 20250620_143022_login/
    ├── login-demo.mp4        # the whole walkthrough (audio included with --voiceover)
    ├── login-demo.webm       # native or voiceover-muxed recording
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
- **every meaningful control on the page was explained** (spotlight-highlighted + captioned),
  not only the ones used in the happy-path action
- **if the action produces or updates content on a different page**, that page was visited
  and the result shown/explained there too
- a screenshot exists for each key milestone under `screenshots/`, including explained
  elements and the result on every page involved
- one whole video exists (`.mp4`, or `.webm` if ffmpeg is unavailable)
- when voiceover was requested, the final `.webm` or `.mp4` has a verified audio stream, the
  complete track was loudness-normalized, and the voiceover was generated from the flow's
  non-empty captions
- synthetic Piper narration is described honestly as neural TTS; a human/non-AI claim is made
  only when a supplied human recording is used
- artifacts are saved under `docs/client-demo/<timestamp>_<feature>/`
- **if `$JHECKBOT_MEDIA_DIR` is set, the final `.mp4` was copied to
  `$JHECKBOT_MEDIA_DIR/capture.mp4`** so it renders inline in the chat reply
- the recorder exited cleanly (no `FLOW_ERROR`) and any mutated data was restored

## Blocked Conditions

Report `BLOCKED` (and do not fabricate a video) when:
- the app is not running or not reachable
- the feature/route cannot be located in the repo
- required auth or demo credentials are unavailable
- the flow hits a real product bug (hand off to `comprehensive-qa-testing` for fixing)
- voiceover was requested but the selected local TTS engine, Piper model/config, or `ffmpeg-static` is unavailable
- no browser tooling can be installed (no Playwright, no network)

State the exact blocker and the minimum next action needed.
