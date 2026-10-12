# Task Continuity Policy — Implementation Plan

**Date:** 2026-10-13
**Spec:** `docs/superpowers/specs/2026-10-13-task-continuity-policy-design.md`

## Steps (ordered)

1. **Create `shared/policy/TASK_CONTINUITY.md`**
   - Full policy v2.0 text verbatim (sections 1–17).
   - Appendix A: verified harness capability table + distribution note.

2. **Update `sync-agents.sh`**
   - Add `SOURCE_POLICY` variable.
   - Add `ensure_policy_source_exists` + `install_policy()` (mirror `install_global_rules()`).
   - Call `install_policy` after `install_global_rules` in the main flow.
   - Update final "Done." message.

3. **Update `shared/rules/global_rules.md`**
   - Insert "TASK CONTINUITY POLICY" section after REQUEST CLASSIFICATION: policy path, checkpoint file + statuses, quota-recovery controller pointer, sub-agent rules, harness-capability verification rule.

4. **Create `.superpowers/CURRENT_TASK.md`**
   - Template instance with all Section 5 fields; dogfood with this task's real state; final status `COMPLETED`.

5. **Implement `quota-recovery-controller.sh`** (repo root, executable)
   - Strict mode; JSON state via `jq` if available else plain key=value fallback? — No: use plain `key=value` state file to avoid a `jq` dependency. (Decision: state file is `.superpowers/recovery/<task-id>.state` with `KEY=value` lines; JSON was aspirational, plain format has no dependency and is greppable.)
   - Subcommands: `record`, `status`, `run`, `resolve`.
   - Category matrix, bounded retries (defaults: max 8, intervals 300s doubling capped at 3600s; test overrides via flags), duplicate-process check via `pgrep -f`, confirmation gate before executing resume (`--yes` to skip), refusal set for `auth|billing|permission`, unknown harness/category → safe stop.
   - Resume command map (verified 2026-10-13): devin → `devin -r <id>` (fallback `devin -c`), codex → `codex resume <id>` (fallback `codex resume --last`), claude → `claude --resume <id>` (fallback `claude --continue`).

6. **Write `tests/test-quota-recovery-controller.sh`**
   - mktemp sandbox; run controller with `--interval-seconds 1 --max-retries 2`.
   - Assert: record→status roundtrip; state fields present; `billing` refused and marked `BLOCKED`; bounded retries exhaust to `EXHAUSTED`; `resolve` writes outcome; unknown harness stops non-zero.

7. **Update `README.md`**
   - Repository layout entries: `shared/policy/`, controller script, `.superpowers/CURRENT_TASK.md`.
   - New "Task Continuity & Quota Recovery" section with quick usage.

8. **QA**
   - `bash -n` on all touched shell scripts.
   - Run the new test; run existing `tests/test-sync-agents-idempotent.sh` (regression: sync script changed).
   - Verify policy symlink logic via the idempotent-sync test's HOME sandbox (no writes to real `~/.config` during testing).
   - Write QA report to `docs/superpowers/qa/2026-10-13-task-continuity-policy-qa.md`.

## Verification commands

```bash
bash -n sync-agents.sh quota-recovery-controller.sh tests/test-quota-recovery-controller.sh
bash tests/test-quota-recovery-controller.sh
bash tests/test-sync-agents-idempotent.sh
```

## Rollback

All changes are new files plus three edited files (`sync-agents.sh`, `shared/rules/global_rules.md`, `README.md`). Revert the edits and delete the new files; no generated or runtime state is touched.
