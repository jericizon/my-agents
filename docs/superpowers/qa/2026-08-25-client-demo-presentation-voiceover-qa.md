# Client Demo Presentation Voiceover QA

## Scope

Validate the opt-in generated caption voiceover in `custom/skills/client-demo-presentation/`, including the free local Piper neural-engine enhancement. The feature must add a real audio stream to the final video when requested, preserve the default video-only path, fail clearly when local prerequisites are unavailable, validate the Piper model/config pair, and keep the voiceover implementation local to the client-demo skill.

## Acceptance results

- `--voiceover` and `DEMO_VOICEOVER=1` enable the feature; other values remain disabled.
- `DEMO_TTS_ENGINE=piper` explicitly selects Piper and never silently falls back to a platform synthesizer.
- Piper requires an executable, a regular `.onnx` model, an adjacent `.onnx.json` file, and valid JSON config.
- Every non-empty `h.caption(...)` call is timestamped and converted into a local TTS segment.
- FFmpeg delays and mixes the segments, then muxes audio into WebM and MP4 using compatible codecs.
- The recorder probes the generated output and logs `AUDIO_STREAM=` only after verification succeeds.
- Missing local TTS, Piper model/config, or `ffmpeg-static` is reported before browser recording starts.
- Temporary voiceover segments and failed partial outputs are removed.
- Existing recordings without voiceover remain video-only and retain the previous MP4/WebM behavior.
- The setup helper pins the free `piper-tts==1.7.0` runtime in a persistent cache, downloads the default voice, and prints reusable exports without touching `.env` or package manifests.
- Documentation distinguishes no usage charges from GPL-3.0-or-later runtime licensing and individual voice/model terms.
- No app server was started; real-user product QA was not applicable to this skill/tooling change.

## Validation evidence

```text
node --test tests/client-demo-presentation-audio.test.mjs
17 passed, 0 failed

bash tests/test-client-demo-presentation-audio.sh
PASS

node --check custom/skills/client-demo-presentation/assets/voiceover.mjs
node --check custom/skills/client-demo-presentation/assets/demo-recorder.mjs
node --check superpowers-agents/skills/client-demo-presentation/assets/voiceover.mjs
node --check superpowers-agents/skills/client-demo-presentation/assets/demo-recorder.mjs
PASS

bash -n custom/skills/client-demo-presentation/assets/setup-voiceover.sh
PASS

git diff --check
PASS

cmp custom/skills/client-demo-presentation/SKILL.md superpowers-agents/skills/client-demo-presentation/SKILL.md
cmp custom/skills/client-demo-presentation/assets/voiceover.mjs superpowers-agents/skills/client-demo-presentation/assets/voiceover.mjs
cmp custom/skills/client-demo-presentation/assets/setup-voiceover.sh superpowers-agents/skills/client-demo-presentation/assets/setup-voiceover.sh
PASS
```

The real setup helper installed the pinned `piper-tts==1.7.0` runtime and downloaded the
`en_US-ljspeech-high` voice into the persistent user cache. Piper generated a valid mono 22,050 Hz
WAV. A real Playwright and cached `ffmpeg-static` smoke test used a disposable data-URL flow; it
produced verified audio-bearing WebM and MP4 output and logged `AUDIO_STREAM=` for both formats.
A separate default-path smoke test produced valid video and confirmed that its MP4 had no audio
stream. Temporary integration artifacts were removed after each run.

The baseline pressure scenario selected the old robotic platform engine. Three post-change
pressure scenarios selected Piper, preserved explicit failure behavior, and surfaced the GPL/model
license caveat. The cross-model doubt review was skipped at the user's direction.

## Repository-wide verification notes

The existing repository shell sweep has unrelated baseline failures because the checkout lacks the skill files expected by:

- `tests/test-creating-playwright-e2e-tests-guidance.sh`
- `tests/test-playwright-e2e-skill-priority.sh`
- `tests/test-custom-writing-guidance.sh`
- `tests/test-qa-skill-artifact-guidance.sh`
- `tests/test-sync-agents-idempotent.sh` also reports an unrelated generated `ui-ux-fork/` status issue.

The core Claude skill suite passed two tests but its `test-subagent-driven-development.sh` test could not authenticate because the OAuth session was expired. No authentication retry was attempted.

## Limitations

- The current Linux environment has no system `ffmpeg` binary; the cached `ffmpeg-static` binary was used. `espeak-ng` and the real Piper runtime/model were available for local smoke tests.
- No production app was available or started, so selectors and a real client feature flow were not recorded. Browser/product real-user QA is therefore unavailable for this tooling-only repository change.
- “Almost-natural” voice quality is subjective; automated checks establish valid neural synthesis and muxing, not human listening preference. Listen to a sample before client distribution.
- The default setup downloads PyPI packages and the voice model on first run; the downloader does not pin an immutable model revision or checksum.
- `superpowers-agents/skills/` is a derived, gitignored mirror. It was synchronized locally from the custom source; future setup/sync runs should regenerate it.
- The pre-existing `$JHECKBOT_MEDIA_DIR` documentation change in `SKILL.md` was preserved and intentionally not expanded as part of this voiceover task.
