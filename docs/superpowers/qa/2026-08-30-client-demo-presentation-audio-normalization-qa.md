# Client Demo Presentation Audio Normalization QA

## Scope

Validate the `client-demo-presentation` skill and voiceover pipeline after adding complete-track loudness normalization, a configurable Piper presentation profile, safer numeric configuration handling, and guidance for synthetic voice provenance. Existing generated recordings were explicitly out of scope and were not modified.

## Acceptance results

- Final assembled voiceover audio is passed through FFmpeg `aresample=48000` and dynamic `loudnorm` with defaults `I=-16`, `TP=-1.5`, and `LRA=7`.
- Loudness overrides (`DEMO_AUDIO_TARGET_LUFS`, `DEMO_AUDIO_MAX_TRUE_PEAK`, `DEMO_AUDIO_TARGET_LRA`) are range-validated and reach the actual mux command.
- Piper defaults to the documented `en_US-lessac-high` setup voice and receives the explicit presentation profile: length `1.0`, noise `0.667`, width noise `0.8`, sentence silence `0.12s`, and volume `1.0`.
- The setup cache records the pinned `piper-tts==1.7.0` version and reuses it only when the marker matches.
- Piper profile overrides are range-validated (`0 < length/volume <= 2`, other profile values `0..2`) before reaching the executable.
- The skill documents that Piper is natural-sounding neural TTS but remains synthetic; it does not claim to create a human/non-AI recording.
- Existing recordings are treated as read-only by default, with exact-input confirmation and separately named outputs required for any future post-processing request.
- The default non-voiceover/video-only recorder path remains unchanged.
- Canonical custom skill files and the generated runtime mirror match.

## Validation evidence

```text
node --test tests/client-demo-presentation-audio.test.mjs
22 passed, 0 failed

bash tests/test-client-demo-presentation-audio.sh
PASS

node --check custom/skills/client-demo-presentation/assets/voiceover.mjs
node --check custom/skills/client-demo-presentation/assets/demo-recorder.mjs
node --check superpowers-agents/skills/client-demo-presentation/assets/voiceover.mjs
node --check superpowers-agents/skills/client-demo-presentation/assets/demo-recorder.mjs
PASS

bash -n custom/skills/client-demo-presentation/assets/setup-voiceover.sh
bash -n superpowers-agents/skills/client-demo-presentation/assets/setup-voiceover.sh
PASS

cmp custom/skills/client-demo-presentation/SKILL.md superpowers-agents/skills/client-demo-presentation/SKILL.md
cmp custom/skills/client-demo-presentation/assets/voiceover.mjs superpowers-agents/skills/client-demo-presentation/assets/voiceover.mjs
cmp custom/skills/client-demo-presentation/assets/setup-voiceover.sh superpowers-agents/skills/client-demo-presentation/assets/setup-voiceover.sh
PASS

git diff --check
PASS
```

## Disposable real-media smoke test

The cached Piper runtime and `ffmpeg-static` executable were used with a temporary cache and
temporary media directory. The setup script downloaded `en_US-lessac-high`, generated two real
Piper WAV segments with the documented profile, and the canonical `muxVoiceover` path produced
both WebM and MP4 outputs.

- Both outputs passed the usable-audio-stream probe.
- Both outputs passed the FFmpeg `loudnorm` diagnostic with the configured target.
- A deliberately attenuated speech segment was leveled by the final filter chain: sampled
  start/end windows measured approximately `-16.9 dB` and `-17.6 dB` mean volume respectively
  (about `0.7 dB` apart) in the disposable WebM test.
- The setup/cache smoke checks reported `SETUP_INSTALL=1` and `SETUP_REUSE=1`; the generated
  wrapper and pinned-version marker worked on both first setup and reuse.
- The temporary setup cache, model, WAV files, video outputs, and diagnostic files were removed
  after the test (`SMOKE_OK=1`).
- No application, server, preview, or watcher was started.

The short smoke clip's diagnostic measurement reported the final encoded WebM around `-14.41 LUFS`
input to a repeat normalization pass and `-1.50 dBTP` after that pass; short clips and lossy codec
round-trips can make one-pass integrated measurements less exact than a full-length demo. The
pipeline target and true-peak guard remain explicit, and a full recording should still be listened
to end-to-end before client delivery.

## Core suite limitation

```text
bash superpowers-fork/tests/claude-code/run-skill-tests.sh
Passed: 2
Failed: 1
```

The only failure was the unrelated `test-subagent-driven-development.sh`, which could not
authenticate because the Claude OAuth session was expired. No authentication retry was attempted.
The two other core tests passed. This does not indicate a failure in the client-demo audio
changes.

## Sources

- FFmpeg loudnorm documentation: https://ffmpeg.org/ffmpeg-filters.html#loudnorm
- Piper CLI/model documentation: https://github.com/rhasspy/piper/blob/9b1c6397/README.md
- Selected voice model card: https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/lessac/high/MODEL_CARD

## Limitations

- No current client-demo recording was processed, per user instruction.
- No live application was available or started; browser/product real-user QA is not applicable to
  this tooling-only change.
- “Close to natural” remains subjective. Piper is still synthetic neural TTS; only a supplied human
  recording can satisfy a literal non-AI voice requirement.
