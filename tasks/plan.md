# Implementation Plan: Consistent Client Demo Voiceover Audio

## Overview
Update the custom `client-demo-presentation` skill so generated voiceover audio is normalized to a consistent loudness across the entire video and uses a deliberately tuned local Piper configuration for a more natural presentation. Existing recordings are explicitly out of scope.

## Architecture Decisions
- Resample the mixed track to 48 kHz, then apply a final EBU R128 `loudnorm` stage so the full assembled track, rather than each segment in isolation, is normalized.
- Keep voice tuning configurable through bounded environment variables and pass only supported Piper options when Piper is selected; preserve existing platform TTS behavior.
- Be explicit that Piper is synthetic and cannot satisfy a literal human-voice requirement without a supplied human recording.
- Keep `custom/skills` canonical; refresh `superpowers-agents/skills` only as generated output through the repository sync workflow.

## Task List

### Phase 1: Regression contract
- [x] Add focused tests for final loudness normalization in the filter/mux arguments.
- [x] Add focused tests for Piper natural-voice configuration and setup/documentation guidance.
- [x] Run the focused tests and confirm they fail for the missing behavior.

### Phase 2: Implementation
- [x] Add final loudness normalization to the voiceover mux filter.
- [x] Add configurable Piper voice parameters with natural-sounding defaults.
- [x] Update skill/setup guidance to explain the defaults, controls, and human-voice limitation.

### Checkpoint: Core behavior
- [x] Focused unit and shell tests pass.
- [x] Syntax checks pass.
- [x] No generated recording is modified.

### Phase 3: Generated copy and QA
- [x] Refresh the generated skill copy from the canonical custom skill without refreshing unrelated upstream mirrors.
- [x] Run the dedicated media/tooling smoke checks and inspect the final diff.
- [x] Complete code review, simplification, and verification before reporting completion.

## Acceptance Criteria
- Final voiceover audio is passed through an explicit R128 loudness target and true-peak limit.
- The target and voice parameters are configurable without editing the recorder.
- Piper uses a high-quality local voice with natural-voice tuning defaults when selected.
- Documentation does not falsely call synthetic Piper audio human or non-AI; it states how to use human audio instead.
- Existing videos remain untouched; default non-voiceover behavior remains unchanged.
- Tests and syntax checks pass, and generated skill output matches the canonical custom source.

## Risks and Mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| `loudnorm` changes perceived dynamics | Medium | Use conservative R128 target/true-peak values and verify with the cached FFmpeg binary. |
| Piper tuning differs by voice/model | Medium | Keep every tuning value configurable and document that voice choice remains model-dependent. |
| Generated skill mirror drifts | Medium | Regenerate from `custom/skills` and compare canonical/generated files. |
| “Not AI-generated” is interpreted literally | High | State the limitation and require a supplied human recording for a non-synthetic deliverable. |

## Open Questions
- None for the requested pipeline-only scope; a human narration file would be required only if the user later asks for a genuinely non-synthetic voice track.
