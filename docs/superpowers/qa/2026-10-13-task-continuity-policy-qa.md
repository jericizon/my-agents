# QA Report — Task Continuity Policy Implementation

**Date:** 2026-10-13
**Task:** TASK-2026-10-13-01 — Implement Universal AI Coding Agent Policy v2.0
**Spec:** `docs/superpowers/specs/2026-10-13-task-continuity-policy-design.md`
**Plan:** `docs/superpowers/plans/2026-10-13-task-continuity-policy.md`
**Checkpoint:** `.superpowers/CURRENT_TASK.md`

## Verification Commands and Actual Results

| Command | Result |
|---|---|
| `bash -n sync-agents.sh quota-recovery-controller.sh tests/test-quota-recovery-controller.sh tests/test-sync-agents-idempotent.sh` | Clean (no syntax errors) |
| `bash tests/test-quota-recovery-controller.sh` | `PASS: quota-recovery-controller` |
| `bash tests/test-sync-agents-idempotent.sh` | `PASS: sync-agents is idempotent for tracked repo files` |

## Test Coverage Detail

### Controller (`tests/test-quota-recovery-controller.sh`, 9 cases)

1. **Record/status roundtrip** — state file created with HARNESS, CATEGORY, STATUS, SESSION_ID, RETRY_COUNT, BASE_INTERVAL; `status` prints it.
2. **Refused category (billing)** — recorded as `BLOCKED`; `run` exits 2 and attempts nothing.
3. **Resume command generation** — `run --print-command` prints the verified `devin -r sess-abc`, increments `RETRY_COUNT`, sets `READY_TO_RESUME`.
4. **Bounded retries** — with `--max-retries 1`, a second `run` exits 4 and sets `EXHAUSTED`; nothing launches.
5. **`--yes` execution** — exec runs a fake harness binary (marker file proves it), which receives the session id; no real CLI touched.
6. **Non-interactive confirmation gate** — `run` without `--yes`/`--print-command` on a non-TTY stdin exits 5 and launches nothing.
7. **Unknown harness** — `record` exits 1 with a stop-and-report message; nothing invented.
8. **Resolve** — writes `OUTCOME=manual`, `STATUS=RESOLVED`.
9. **State integrity** — `state_set` rewrite path exercised across cases 3–5 (no sed escaping issues; values with spaces survive).

### Sync regression (`tests/test-sync-agents-idempotent.sh`)

- Full `sync-agents.sh` run in a sandboxed HOME against local bare-repo fixtures.
- New assertions: `~/.config/agent-workflow/TASK_CONTINUITY.md` is a symlink to the fixture's `shared/policy/TASK_CONTINUITY.md`; `ui-ux-pro-max` skill imported from the local ui-ux fixture.
- Git status stays clean after sync.

## Issues Found and Fixed During QA

1. **Pre-existing bug (fixed):** `ensure_rules_source_exists`/`ensure_policy_source_exists` printed errors to stdout, which the idempotent test sends to `/dev/null` — failures were invisible. Both now write to stderr.
2. **Pre-existing test failure (fixed):** `test-sync-agents-idempotent.sh`'s fixture predated the `ui-ux-fork` integration, so sync cloned ui-ux from the network into the sandbox and dirtied git status. Fixture now seeds a local `ui-ux-fork` bare repo (same pattern as the other two forks) with the allowlisted skill.
3. **Controller review fixes:** `state_set` originally used `sed` (breaks on `|`/`&` in values) — replaced with a filter-and-append rewrite; retry-budget check was a degenerate `while` — now an `if`; `record` now persists `BASE_INTERVAL` so backoff is consistent between `record` and `run`.

## Acceptance Criteria Verification

1. Policy file contains the full v2.0 text + Appendix A (verified capabilities table) — verified by file creation and review.
2. Sync links the policy idempotently with backups — verified by the idempotent test (symlink assertions + clean git status on second-run path).
3. Global rules reference the policy and checkpoint path; no existing rules removed — verified by diff review (13 added lines, 0 removed).
4. `.superpowers/CURRENT_TASK.md` exists with all Section 5 fields and valid statuses — verified by review; dogfooded through this task to `COMPLETED`.
5. Controller behaviors verified per the 9 test cases above.
6. Controller test passes — verified.
7. `bash -n` clean; README documents policy, controller, checkpoint — verified.

## Security Review

- Controller never auto-launches a session: interactive confirmation required; non-TTY without `--yes` exits 5 (tested).
- `auth`/`billing`/`permission` categories are never retried (tested).
- Task IDs are validated against `[A-Za-z0-9._-]` (path-traversal guard); state values are newline-sanitized; state writes avoid shell/sed injection.
- Duplicate-session `pgrep` check refuses to restart work that may still be running.
- State files store IDs and paths only; checkpoints carry a no-secrets rule.
- No secrets, tokens, or credentials introduced anywhere in the diff.

## Limitations

- The controller cannot query live quota balances: Devin documents no programmatic quota API, and Codex/Claude expose none via CLI help. Recovery eligibility is time-based; the human confirmation gate is the final decision point. This is by design (policy Section 12: preserve checkpoint and require manual restart when no supported detection exists).
- `pgrep`-based duplicate detection is best-effort and matches on harness+session-id.
- Resume commands are verified against installed versions (Devin 3000.11.3, Codex 0.139.0, Claude 2.1.236); Appendix A records the check date so future version drift is detectable.

## Regression Check

- No existing tests removed or weakened; the only modified test gained assertions.
- `global_rules.md` diff is purely additive (13 lines inserted, none removed).
- `sync-agents.sh` diff is additive except the two stderr fixes (behavior strictly improved).

## Conclusion

All acceptance criteria verified with evidence. Task COMPLETED per the checkpoint at `.superpowers/CURRENT_TASK.md`.
