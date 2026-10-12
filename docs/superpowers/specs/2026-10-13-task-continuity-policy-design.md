# Task Continuity Policy — Design

**Date:** 2026-10-13
**Status:** Approved (design presented in chat and approved by user)
**Type:** NEW_FEATURE

## Objective

Implement the "Universal AI Coding Agent Policy v2.0" (cross-harness task continuity, quota recovery, sub-agent orchestration, TDD, QA) as durable artifacts in this repository so that:

1. The policy has a single canonical, versioned source (Layer A).
2. Every configured harness loads it through the existing global-rules distribution (Layer B).
3. Projects have a concrete checkpoint file standard (Layer C).
4. Usage-limit interruptions have a verified, safety-gated recovery controller (Section 12).

## Background

The policy defines a three-layer architecture: a shared global policy file, harness-specific adapters, and project-level checkpoints. This repo already distributes global rules via symlinks from `shared/rules/global_rules.md` to six CLI configs, so Layer B needs no per-harness files. The canonical policy path required by the policy (`~/.config/agent-workflow/TASK_CONTINUITY.md`) does not exist yet.

### Verified harness capabilities (checked 2026-10-13)

| Harness | Version | Resume mechanism | Quota guidance |
|---|---|---|---|
| Devin CLI | 3000.11.3 | `devin -c` / `devin -r [id]` / `devin --cloud -r <url>` | Wait + org usage dashboard; no programmatic API documented |
| Codex CLI | 0.139.0 | `codex resume [SESSION_ID]`, `codex resume --last` | — |
| Claude Code | 2.1.236 | `claude --resume <id>`, `claude --continue` | — |

The controller must not invent flags, APIs, or quota-reset mechanisms beyond this table.

## Scope

In scope:
- Canonical policy file in-repo, symlinked to `~/.config/agent-workflow/TASK_CONTINUITY.md` by `sync-agents.sh`.
- Policy reference section in `shared/rules/global_rules.md` (reaches all six harness configs).
- `.superpowers/CURRENT_TASK.md` checkpoint standard with the policy's Section 5 schema; existing `.superpowers/sdd/<id>/progress.md` remains valid for spec-driven tasks.
- Full recovery controller script with state file, bounded retry loop, and session-status checks.
- Assert-based test for the controller; README documentation; spec/plan/QA docs.

Out of scope:
- A separate invocable skill (user chose rules-reference only).
- Changes to upstream mirrors (`superpowers-fork`, `agent-skills-fork`, `ui-ux-fork`).
- Automatic session resume without user confirmation; automatic quota-status APIs where none are documented.
- Any change to harness CLI behavior itself.

## Architecture

```
shared/policy/TASK_CONTINUITY.md          (canonical, versioned)
        │  sync-agents.sh install_policy()
        ▼
~/.config/agent-workflow/TASK_CONTINUITY.md   (symlink; Layer A runtime path)
        ▲  referenced by
shared/rules/global_rules.md ──symlinked──► 6 CLI configs   (Layer B adapters)
        ▲  followed by
.superpowers/CURRENT_TASK.md               (Layer C, per project)
        ▲  consumed by
quota-recovery-controller.sh               (Section 12 automation)
```

## Components

### 1. `shared/policy/TASK_CONTINUITY.md`

The user's policy text verbatim (all 17 sections), plus one clearly-marked appendix containing the verified harness capability table above and the distribution note. No meaning-changing edits.

### 2. `sync-agents.sh` — `install_policy()`

New function following the `install_global_rules()` pattern: source `shared/policy/TASK_CONTINUITY.md`, target `~/.config/agent-workflow/TASK_CONTINUITY.md`, `mkdir -p`, skip if already linked, back up and replace otherwise. Called from the main flow after `install_global_rules`. Fails fast if the source file is missing.

### 3. `shared/rules/global_rules.md` — adapter section

A concise "TASK CONTINUITY POLICY" section (~20 lines): canonical path, when to create/update `.superpowers/CURRENT_TASK.md`, checkpoint statuses, quota-recovery pointer to the controller, sub-agent coordination summary, and the rule to verify harness capabilities rather than assume them.

### 4. `.superpowers/CURRENT_TASK.md`

Checkpoint template instance with all Section 5 required fields and explicit statuses (`PLANNING`, `IN_PROGRESS`, `WAITING_FOR_QUOTA`, `BLOCKED`, `READY_TO_RESUME`, `QA_IN_PROGRESS`, `NEEDS_USER_INPUT`, `COMPLETED`). This task itself dogfoods the file: it is filled in with real task state and ends `COMPLETED`.

### 5. `quota-recovery-controller.sh` (repo root)

Bash, `set -euo pipefail`. State stored as JSON at `.superpowers/recovery/<task-id>.state.json` inside the target project.

Subcommands:
- `record --harness H --project DIR --task-id ID [--session-id S] [--checkpoint PATH] --category C [--progress "text"]` — create/update state; computes next retry time.
- `status --project DIR --task-id ID` — print state.
- `run --project DIR --task-id ID [--yes] [--max-retries N] [--interval-seconds N]` — recovery loop: refuse non-recoverable categories; bounded retries with increasing intervals; check for a still-running harness process before resuming; print (and with confirmation, execute) the verified resume command.
- `resolve --project DIR --task-id ID --outcome O` — record final outcome.

Failure-category matrix:
- `rate_limit`, `quota`, `acu_exhausted`, `network` → recoverable: wait + bounded retry.
- `session_expired` → recoverable via replacement session; resume command uses the harness's most-recent/continue form only with user confirmation.
- `auth`, `billing`, `permission` → not recoverable by waiting: state set to `BLOCKED`, resume refused, human action required.
- Unknown category or unknown harness → stop and report; never invent mechanisms.

Safety requirements (from policy Section 12): no bypassing limits or access controls; no infinite retry loop (hard max); no duplicate sessions (best-effort `pgrep` check); no auto-approval — interactive confirmation required unless `--yes` is passed explicitly; auth/billing never retried automatically; stop-and-report when no supported path exists.

### 6. `tests/test-quota-recovery-controller.sh`

Assert-based shell test in the existing `tests/` style (mktemp sandbox): record/status roundtrip; category refusal for `billing`; bounded-retry exhaustion with tiny intervals; state file schema fields present; `resolve` marks final outcome.

### 7. Documentation

- README: policy file, install path, controller usage, checkpoint convention.
- QA report in `docs/superpowers/qa/`.

## Acceptance criteria

1. `shared/policy/TASK_CONTINUITY.md` contains the full policy text and the verified-capabilities appendix.
2. `sync-agents.sh` links it to `~/.config/agent-workflow/TASK_CONTINUITY.md`; re-running is idempotent; existing target files are backed up first.
3. `global_rules.md` references the policy and checkpoint path; no existing rules removed.
4. `.superpowers/CURRENT_TASK.md` exists with all required fields and valid statuses.
5. Controller: `record`/`status`/`run`/`resolve` work; `billing`/`auth`/`permission` are refused; retries are bounded; unknown harness/category stops safely; no session is launched without confirmation.
6. Controller test passes.
7. All shell scripts pass `bash -n`; README documents the new artifacts.

## Risks and limitations

- The controller cannot query live quota balances (no documented API for Devin; Codex/Claude do not expose one via CLI help). It detects nothing by itself: state is recorded when the agent or user hits a limit, and recovery eligibility is time-based. This is documented, not hidden.
- `pgrep`-based duplicate-process detection is best-effort.
- Resume commands are verified against installed versions (see table); future CLI versions may change flags — the appendix records the versions checked.
