# Client Demo Presentation Voiceover QA

## Scope

Validate the opt-in generated caption voiceover added to `custom/skills/client-demo-presentation/`. The feature must add a real audio stream to the final video when requested, preserve the default video-only path, fail clearly when local prerequisites are unavailable, and keep the voiceover implementation local to the client-demo skill.

## Acceptance results

- `--voiceover` and `DEMO_VOICEOVER=1` enable the feature; other values remain disabled.
- Every non-empty `h.caption(...)` call is timestamped and converted into a local TTS segment.
- FFmpeg delays and mixes the segments, then muxes audio into WebM and MP4 using compatible codecs.
- The recorder probes the generated output and logs `AUDIO_STREAM=` only after verification succeeds.
- Missing local TTS or `ffmpeg-static` is reported before browser recording starts.
- Temporary voiceover segments and failed partial outputs are removed.
- Existing recordings without voiceover remain video-only and retain the previous MP4/WebM behavior.
- The skill and example flow document the exact opt-in interface, local TTS prerequisites, timing guidance, and blocked conditions.
- No app server was started; real-user product QA was not applicable to this skill/tooling change.

## Validation evidence

```text
node --test tests/client-demo-presentation-audio.test.mjs
12 passed, 0 failed

bash tests/test-client-demo-presentation-audio.sh
PASS

node --check custom/skills/client-demo-presentation/assets/voiceover.mjs
node --check custom/skills/client-demo-presentation/assets/demo-recorder.mjs
node --check superpowers-agents/skills/client-demo-presentation/assets/voiceover.mjs
node --check superpowers-agents/skills/client-demo-presentation/assets/demo-recorder.mjs
PASS

git diff --check
PASS
```

A real Playwright and cached `ffmpeg-static` smoke test used a temporary espeak-compatible local TTS executable and a caption-only flow. It produced verified audio-bearing WebM and MP4 output, removed the temporary `.voiceover` directory, and logged `AUDIO_STREAM=` for both formats. A separate default-path smoke test produced a valid video and confirmed that its WebM had no audio stream.

The three post-change pressure scenarios all selected the implemented, verified voiceover path rather than documenting an aspirational flag or inventing remote/background audio.

## Repository-wide verification notes

The existing repository shell sweep has unrelated baseline failures because the checkout lacks the skill files expected by:

- `tests/test-creating-playwright-e2e-tests-guidance.sh`
- `tests/test-playwright-e2e-skill-priority.sh`
- `tests/test-custom-writing-guidance.sh`
- `tests/test-qa-skill-artifact-guidance.sh`
- `tests/test-sync-agents-idempotent.sh` also reports an unrelated generated `ui-ux-fork/` status issue.

The core Claude skill suite passed two tests but its `test-subagent-driven-development.sh` test could not authenticate because the OAuth session was expired. No authentication retry was attempted.

## Limitations

- The current Linux environment has no real `espeak`, `espeak-ng`, or system `ffmpeg` binary. The cached `ffmpeg-static` binary was used, and the TTS subprocess/mux path was exercised with a temporary valid WAV-producing local executable.
- No production app was available or started, so selectors and a real client feature flow were not recorded.
- `superpowers-agents/skills/` is a derived, gitignored mirror. It was refreshed locally from the custom source; future setup/sync runs should regenerate it.
- The pre-existing `$JHECKBOT_MEDIA_DIR` documentation change in `SKILL.md` was preserved and intentionally not expanded as part of this voiceover task.
