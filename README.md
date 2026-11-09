# My Agents

Local manager for Superpowers skills with:
- a repo-local merged generated skills mirror at `superpowers-agents/skills`
- optional local overrides at `custom/skills`
- an upstream Superpowers mirror at `forks/superpowers-fork`
- an upstream `ui-ux-pro-max-skill` mirror at `forks/ui-ux-fork` (only the `ui-ux-pro-max` skill is imported)
- the canonical Universal AI Coding Agent Policy at `shared/policy/TASK_CONTINUITY.md`

The scripts in this repo keep one generated skills source in this workspace, then expose it to both Codex and Claude Code.

## Requirements

- `bash`
- `git`
- `timeout` (GNU coreutils; enables hard per-attempt timeouts on git network calls, recommended)
- `pgrep` and `ps` (used by the recovery controller's duplicate-session check)
- `npm` (only needed for some test suites)

## Repository Layout

- `superpowers-agents/skills/`: generated sync target used as the shared runtime skill source
- `custom/skills/`: editable local custom/override skills copied into the generated mirror on setup/update
- `shared/policy/TASK_CONTINUITY.md`: canonical Universal AI Coding Agent Policy (v2.0), linked to `~/.config/agent-workflow/TASK_CONTINUITY.md` on sync
- `quota-recovery-controller.sh`: recovery controller for usage-limit interruptions (policy Section 12)
- `forks/superpowers-fork/`: upstream Superpowers mirror used as one update source
- `forks/ui-ux-fork/`: upstream `nextlevelbuilder/ui-ux-pro-max-skill` mirror; its skills live under `.claude/skills/` and only the names in `UI_UX_SKILL_ALLOWLIST` are imported
- `sync-agents.sh`: the only maintenance entrypoint; clones or refreshes all upstream mirrors, rebuilds generated skills, refreshes runtime links, and links global rules
- `lib/reliability.sh`: shared helpers sourced by both scripts (structured events, jittered backoff, locks, alerts, abort boundary)

## Quick Start (Single Command)

1. Clone this repo.
2. From repo root, run:

```bash
./sync-agents.sh
```

This will:
- clone missing upstream mirrors or refresh existing ones
- update all upstream mirrors and reapply custom skills
- update global rules links across configured CLIs
- rebuild `superpowers-agents/skills` from:
  1. `forks/superpowers-fork/skills`
  2. `forks/ui-ux-fork/.claude/skills` for allowlisted, non-conflicting skill names only
  3. `custom/skills/*`
- create/refresh `~/.agents -> <this-repo>/superpowers-agents`
- create/refresh `~/.claude/skills -> <this-repo>/superpowers-agents/skills`
- fall back to copying into `~/.claude/skills` only if the Claude symlink cannot be created
- per-skill-link every generated skill into `~/.codex/skills` and `~/.gemini/skills` (existing packs there are preserved; stale links pruned)
- ensure `<workspace>/_shared` exists — the central directory for harness-generated artifacts (see below)

Important:
- `superpowers-agents/skills` is generated output and is gitignored in this repo
- make persistent skill edits under `custom/skills`, not under `superpowers-agents/skills`

## Daily Update Flow

Recommended:

```bash
./sync-agents.sh
```

This will:
- always run all upstream skill updates, rebuild the merged generated tree, and refresh global rules in one pass

If `~/.agents` or `~/.claude/skills` already exists, the installer backs it up to `*.backup.<timestamp>` before replacing it.

## Sync Failure Handling

- Clone and fetch retry only network-level failures (DNS, connection reset, timeouts, HTTP 5xx or 429). Authentication, missing-repository, and other permanent errors fail at once.
- Each attempt has a hard timeout (`SYNC_ATTEMPT_TIMEOUT_SECONDS`, default 180) and git stall detection. Retries stop after `SYNC_MAX_ATTEMPTS` (default 3) or once `SYNC_DEADLINE_SECONDS` (default 600) has passed. Backoff starts at `SYNC_BACKOFF_BASE_SECONDS` (default 2), doubles, is jittered, and is capped at 30s.
- A lock at `~/.cache/my-agents/sync.lock` keeps the git-hook sync and a manual sync from running together. A second run waits up to `SYNC_LOCK_WAIT_SECONDS` (default 60), then stops.
- Skills are built in a staging directory and swapped in only when complete, so a failed build keeps the previous tree.
- A failed sync exits non-zero and writes one `level=alert` line to stderr. To deliver alerts elsewhere, set `ALERT_COMMAND` to an executable that reads the line on stdin. No alert channel is configured in this repo.
- Hard timeouts need GNU `timeout`. Without it, a warning is logged and only git's stall detection applies.

## Global Rules Across CLIs

Canonical global rules file in this repo:

```text
shared/rules/global_rules.md
```

Install for configured CLIs:

```bash
./sync-agents.sh
```

The sync script creates symlinks (with automatic backups if a target file exists) for:
- `~/.codex/AGENTS.md`
- `~/.claude/CLAUDE.md`
- `~/.gemini/GEMINI.md`
- `~/.codeium/windsurf/memories/global_rules.md`
- `~/.antigravity/AGENTS.md`
- `~/.devin/AGENTS.md`

It also links the task continuity policy to:

```text
~/.config/agent-workflow/TASK_CONTINUITY.md -> <this-repo>/shared/policy/TASK_CONTINUITY.md
```

New device flow:
1. Pull this repository.
2. Run `./sync-agents.sh`

Any future edits to `shared/rules/global_rules.md` immediately apply to all linked CLIs.

## Shared Workspace Artifacts

Files that harnesses generate but that are not project source — `docs/superpowers/` (specs, plans, QA, reviews, retrospectives), `.superpowers/` state (checkpoints, recovery, brainstorm sessions), `tasks/` scratch — live outside repositories under:

```text
<workspace>/_shared/<project path relative to workspace>/
```

`<workspace>` is `~/Workspace` if it exists, else `~/workspace`, else `~/Workspace` (created on sync). Examples: `~/Workspace/my-agents` → `~/Workspace/_shared/my-agents`, `~/Workspace/clients/adzeela` → `~/Workspace/_shared/clients/adzeela`. Projects outside the workspace root keep using in-repo paths. `sync-agents.sh` creates `_shared`; per-project dirs are created lazily on first write. Every configured harness learns the convention through the linked global rules. `_shared` content is never committed to a repository.

## Task Continuity and Quota Recovery

The Universal AI Coding Agent Policy (v2.0) lives at `shared/policy/TASK_CONTINUITY.md` and is referenced from the global rules, so every configured harness loads it. It requires a durable checkpoint at `<project shared dir>/.superpowers/CURRENT_TASK.md` for every non-trivial, multi-step task (see that file for the template).

When a harness hits a usage limit, record the failure and let the controller handle waiting and resumption:

```bash
# Record a failure event (agent or human, right after the limit is hit)
./quota-recovery-controller.sh record \
  --harness devin --project /path/to/project --task-id my-task \
  --session-id brisk-otter --category quota \
  --progress "Implemented X, tests pending"

# Check state
./quota-recovery-controller.sh status --project /path/to/project --task-id my-task

# Wait until the next eligible retry, then print (or with --yes, execute) the
# verified resume command; requires interactive confirmation without --yes
./quota-recovery-controller.sh run --project /path/to/project --task-id my-task

# After the resumed session finishes, record the outcome
./quota-recovery-controller.sh resolve --project /path/to/project --task-id my-task --outcome succeeded
```

Behavior and safety:
- Categories `auth`, `billing`, `permission` are recorded as `BLOCKED`. `run` refuses them, because waiting cannot fix them, and raises one alert.
- Retries are bounded (default 8). Waits double from 300s, capped at 3600s, with jitter (each wait falls between half and all of its scheduled interval). Override with `--max-retries` / `--interval-seconds`; both must be positive integers.
- A retry is consumed only when a resume is confirmed and launched. `--print-command`, a declined prompt, or a refused run consumes nothing.
- Each task has a lock, and a retry is claimed under it, so two controllers cannot launch the same retry. Exhausting the budget raises one alert.
- The duplicate-session check refuses when a matching process may still be running. It fails closed if `pgrep` is missing or errors, and it ignores the controller's own process tree.
- Every event is appended to `<task-id>.log` beside the state file. Progress text and session IDs are never written there.
- Resume commands use only mechanisms verified against the installed harness versions (see Appendix A of the policy). Unknown harnesses or categories stop without inventing anything.
- State lives at `<project shared dir>/.superpowers/recovery/<task-id>.state` (in-repo when the project is outside the workspace root); it stores IDs and paths only, never secrets.

## Add or Override a Skill

Create your skill under:

```text
custom/skills/<skill-name>/SKILL.md
```

Use kebab-case for `<skill-name>` (example: `qa-testing`).

Then run:

```bash
./sync-agents.sh
```

Your custom skill will be copied into `superpowers-agents/skills`, which is then exposed to both Codex and Claude Code.

Merge precedence is:
1. `forks/superpowers-fork/skills`
2. `forks/ui-ux-fork/.claude/skills` for allowlisted, non-conflicting skill names only
3. `custom/skills`

If a skill exists in more than one source, the earlier source in this list wins unless you override it in `custom/skills`.

To import more skills from the `ui-ux-pro-max-skill` repo (it ships `ui-styling`, `design`, `design-system`, `brand`, `slides`, `banner-design`), add their names to `UI_UX_SKILL_ALLOWLIST` in `sync-agents.sh`.

## Tests

Repo tests run offline in temp directories, with fake `git`, `pgrep`, and harness CLIs:

```bash
bash tests/test-reliability-lib.sh
bash tests/test-sync-agents-reliability.sh
bash tests/test-quota-recovery-controller.sh
```

Upstream Superpowers skill tests, from repo root:

```bash
bash forks/superpowers-fork/tests/claude-code/run-skill-tests.sh
```

Integration run:

```bash
bash forks/superpowers-fork/tests/claude-code/run-skill-tests.sh --integration
```

Brainstorm harness test:

```bash
cd forks/superpowers-fork/tests/brainstorm-server && npm test
```

## Notes

- `sync-agents.sh` intentionally runs `git reset --hard upstream/main` inside all local upstream mirrors to keep them clean.
- `custom/skills` is your safe place for local changes that should survive updates.
- `superpowers-agents/skills` is intentionally regenerated on sync and should not be treated as a hand-edited source directory.
- Claude Code should read the same generated tree via `~/.claude/skills`, or receive a refreshed copy there if symlinks are unavailable.
