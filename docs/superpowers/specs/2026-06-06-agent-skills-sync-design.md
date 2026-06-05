# Agent Skills Sync Design

Add `https://github.com/addyosmani/agent-skills` as a second upstream skill source in this repository so `./sync-agents.sh` refreshes both upstream mirrors, rebuilds the generated local skill tree, and keeps Codex and Claude Code linked to the merged result. When a skill name exists in both upstreams, the existing Superpowers skill must remain authoritative.

## Motivation

This repository already manages one generated skills tree:
- `superpowers-fork` is the upstream mirror source.
- `custom/skills` is the local override source.
- `superpowers-agents/skills` is the generated runtime tree exposed to `~/.agents` and `~/.claude/skills`.

The user wants Addy Osmani's `agent-skills` pack to participate in the same update flow without replacing the current Superpowers-based setup. The merged result must remain deterministic and low-maintenance:
- one command: `./sync-agents.sh`
- one generated runtime tree: `superpowers-agents/skills`
- Superpowers wins on collisions
- local custom skills still win over both upstreams

## Problem Statement

The current sync pipeline only knows about one upstream skill source. That means:
- `./sync-agents.sh` cannot install or refresh `agent-skills`
- there is no stable merge order for combining both upstream catalogs
- name collisions have no defined precedence rule
- the runtime links in `~/.agents` and `~/.claude/skills` cannot reflect a merged catalog because only one upstream is copied into the generated tree

The change must add a second upstream source without introducing a separate runtime tree, a manual post-step, or a fragile one-off import process.

## Goals

- Keep `./sync-agents.sh` as the single entrypoint for first-time setup and daily updates.
- Clone and refresh a local mirror of `addyosmani/agent-skills` inside this repo.
- Rebuild `superpowers-agents/skills` from multiple ordered sources.
- Preserve current runtime install behavior through `setup-agents.sh`.
- Keep merge precedence explicit and testable.
- Update repository documentation so the second upstream source is discoverable and maintainable.

## Proposed Behavior

### Source Mirrors

The repository will maintain two upstream mirror directories:
- `superpowers-fork/`
- `agent-skills-fork/`

Both are local Git mirrors used only as update sources for the generated runtime tree.

### Generated Tree Build Order

`superpowers-agents/skills` remains the only generated runtime tree.

Its contents will be rebuilt in this order:
1. copy all skills from `superpowers-fork/skills`
2. copy skills from `agent-skills-fork/skills` only when the destination directory name does not already exist
3. copy all directories from `custom/skills` last

This ordering enforces the required precedence:
- Superpowers upstream wins over Addy upstream
- local custom skills win over both upstreams

### Collision Handling

A collision is any top-level skill directory that exists in both upstream skill sources.

Required behavior:
- keep the already-copied Superpowers directory unchanged
- skip copying the colliding Addy directory
- emit a readable log line naming the skipped directory and the reason

Example:
- if both upstreams contain `test-driven-development`, the generated tree must keep the Superpowers version

### Setup And Update Flow

`./sync-agents.sh` remains the public entrypoint and should continue to:
- perform first-time setup when upstream mirrors are missing
- refresh skills on every run
- refresh global rules on every run

`setup-superpowers-fork.sh` should evolve into first-time upstream setup for both mirrors even if its filename stays unchanged for compatibility.

`update-skills.sh` should:
- ensure both local mirrors exist
- ensure each mirror has the expected upstream remote configuration
- fetch the latest upstream state for both mirrors
- reset each mirror to the authoritative upstream branch tip
- clear and rebuild `superpowers-agents/skills`
- refresh runtime paths via `setup-agents.sh`

The current symlink-first and Claude copy-fallback behavior in `setup-agents.sh` is not being redesigned. The generated tree will simply contain more skills after the merge.

## Affected Surface

Primary implementation surface:
- `sync-agents.sh`
- `setup-superpowers-fork.sh`
- `update-skills.sh`
- `README.md`

Likely additional test surface:
- `tests/test-sync-agents-idempotent.sh`
- `tests/test-update-skills-missing-upstream.sh`
- one new fixture-based shell regression test for merge precedence
- one new fixture-based shell regression test for importing a non-conflicting Addy skill

The change should avoid modifying `setup-agents.sh` unless the new upstream flow reveals an actual need. Runtime path installation is already centralized there.

## Data And Configuration Rules

The implementation should define:
- the Addy upstream repository URL as a script variable, similar to the existing Superpowers upstream URL
- a stable local mirror path, expected to be `agent-skills-fork`

The merge logic must operate on top-level skill directories only. It should not attempt to merge files inside a colliding directory. Directory-level precedence is the rule.

If the Addy repository layout differs from the expected `skills/<skill-name>/SKILL.md` structure in the future, the update flow should fail explicitly rather than silently generating a partial tree.

## Validation And Error Behavior

The scripts must fail clearly when:
- a required upstream mirror cannot be cloned during first-time setup
- a required upstream fetch fails during update
- an expected `skills` directory is missing from either mirror
- the generated tree cannot be rebuilt

The scripts must continue to preserve the current runtime-link safety behavior:
- existing runtime targets are backed up before replacement
- Claude Code still falls back to copying when symlink creation fails

The logs should make it obvious whether:
- a mirror was cloned or updated
- an Addy skill was imported
- an Addy skill was skipped because Superpowers already owns that name

## Non-Goals

Out of scope for this change:
- renaming colliding skills so both upstream versions coexist
- per-file merging inside a skill directory
- adding plugin or marketplace installation flows for `agent-skills`
- changing the public entrypoint name from `sync-agents.sh`
- redesigning runtime path targets in `~/.agents` or `~/.claude/skills`
- introducing long-running processes or dev servers

## Acceptance Criteria

- Running `./sync-agents.sh` on a fresh clone sets up both upstream mirrors and produces a merged `superpowers-agents/skills` tree.
- Running `./sync-agents.sh` on an existing clone refreshes both upstream mirrors and rebuilds the merged tree.
- A skill that exists only in `agent-skills` appears in `superpowers-agents/skills` after sync.
- A skill that exists in both upstreams remains the Superpowers version in `superpowers-agents/skills`.
- `custom/skills` continues to override any upstream skill with the same directory name.
- `setup-agents.sh` continues to expose the merged generated tree to `~/.agents` and `~/.claude/skills`.
- Existing symlink-first and Claude copy-fallback behavior still works.
- The README documents the second upstream source, the merge precedence, and the one-command sync flow.
- The implementation is covered by targeted shell regression tests for import behavior and collision precedence.

## Testing Expectations

Implementation planning should include:
- fixture-based shell tests for first-time or update sync behavior
- a regression test proving a unique Addy skill is imported into the generated tree
- a regression test proving a colliding skill such as `test-driven-development` stays on the Superpowers version
- re-running existing local shell tests that cover sync idempotency, missing-upstream handling, and Claude copy fallback

The verification path should prefer targeted repo-local shell tests over broader external integration coverage.
