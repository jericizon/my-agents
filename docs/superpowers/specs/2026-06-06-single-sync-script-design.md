# Single Sync Script Design

Consolidate the repository's agent-maintenance shell scripts into one real entrypoint: `./sync-agents.sh`. Running that file with no arguments must automatically bring the local skill mirrors, generated skills tree, runtime links, and global rules links fully up to date.

## Motivation

The current repository spreads maintenance behavior across multiple shell scripts:
- `sync-agents.sh`
- `setup-agents.sh`
- `setup-superpowers-fork.sh`
- `update-skills.sh`
- `install-global-rules.sh`

That split made the flow easier to evolve incrementally, but it creates unnecessary surface area for the user:
- multiple filenames to remember
- duplicated helper logic across scripts
- fixture tests that must copy several scripts into temporary workspaces
- drift risk when one wrapper changes and another does not

The user wants a simpler operator experience: run one file and have it automatically perform whatever setup or update work is required.

## Problem Statement

The repository currently has one logical workflow split across five shell entrypoints:
- prepare or repair local upstream mirror clones
- refresh upstream mirror state
- rebuild the generated merged skill tree
- refresh runtime links for Codex and Claude Code
- refresh global rule links

Even though `sync-agents.sh` already acts as the top-level wrapper, the real behavior is still fragmented across the other scripts. The consolidation must reduce that to one maintained shell file without changing the existing functional outcome.

## Goals

- Keep `./sync-agents.sh` as the only user-facing shell entrypoint.
- Move the behavior of the other maintenance scripts into internal functions inside `sync-agents.sh`.
- Preserve the current merged-skill behavior:
  - `superpowers-fork/skills`
  - `agent-skills-fork/skills` for non-conflicting skill names only
  - `custom/skills` last
- Preserve the current runtime-link behavior:
  - `~/.agents` symlink to the generated tree
  - `~/.claude/skills` symlink first, copy fallback on failure
- Preserve the current global rules link behavior.
- Simplify tests so fixture workspaces only need to copy one script file.

## Proposed Behavior

### Single Entrypoint

`./sync-agents.sh` becomes the single maintained script in the repository for agent-sync operations.

Running:

```bash
./sync-agents.sh
```

must always perform the full “make everything current” flow.

No arguments are required. The primary mode is automatic full sync.

### Automatic Flow

On each run, `sync-agents.sh` must:

1. verify the canonical global rules file exists
2. ensure both upstream mirrors exist:
   - `superpowers-fork`
   - `agent-skills-fork`
3. clone a mirror if it is missing
4. ensure each mirror has an `upstream` remote
5. fetch and reset each mirror to `upstream/main`
6. verify both upstream `skills/` directories exist
7. rebuild `superpowers-agents/skills`
8. copy skills in precedence order:
   - Superpowers first
   - Addy unique skills second
   - local custom skills last
9. refresh runtime paths:
   - `~/.agents`
   - `~/.claude/skills`
10. refresh global rules links for configured CLIs

The run should always end with the repository-managed generated state matching the latest upstream mirror state plus local overrides.

### Internal Structure

The implementation should be one script file with focused internal functions for responsibilities such as:
- remote setup
- mirror clone or refresh
- generated tree rebuild
- runtime path installation
- global rules installation

This is an internal code-organization choice only. Those functions are not separate scripts and are not intended as a new CLI surface.

### Script Deletions

The following files should be removed after their logic is folded into `sync-agents.sh`:
- `setup-agents.sh`
- `setup-superpowers-fork.sh`
- `update-skills.sh`
- `install-global-rules.sh`

`sync-agents.sh` remains.

## Affected Surface

Primary implementation surface:
- `sync-agents.sh`
- `README.md`

Primary cleanup surface:
- `setup-agents.sh`
- `setup-superpowers-fork.sh`
- `update-skills.sh`
- `install-global-rules.sh`

Primary test surface:
- `tests/test-agent-skills-import.sh`
- `tests/test-agent-skills-priority.sh`
- `tests/test-sync-agents-idempotent.sh`
- `tests/test-update-skills-missing-upstream.sh`
- `tests/test-claude-skills-copy-fallback.sh`

The tests should be updated so fixture workspaces only need `sync-agents.sh` plus repository content files like `README.md`, `.gitignore`, and `shared/rules/global_rules.md`.

## Data And Precedence Rules

The consolidated script must keep these repository truths unchanged:

- `superpowers-agents/skills` is the single generated runtime skill tree
- `~/.agents` points to the generated agent tree
- `~/.claude/skills` points to the generated skills tree when symlinks succeed, or receives a copied tree when symlinks fail
- merge precedence is:
  1. `superpowers-fork/skills`
  2. `agent-skills-fork/skills` only for non-conflicting skill names
  3. `custom/skills`

If a skill directory exists in both upstream mirrors, the Superpowers version must remain authoritative unless a local override exists in `custom/skills`.

## Validation And Error Behavior

The consolidated script must fail clearly when:
- a required upstream clone fails
- an upstream fetch fails
- an expected `skills/` directory is missing
- the canonical rules file is missing
- a runtime source directory is missing before link installation

The consolidated script must keep the current safety behavior:
- existing runtime targets are backed up before replacement
- existing global-rules targets are backed up before replacement
- Claude Code link installation attempts `ln -s` first and falls back to copying on failure

The logs should still make these outcomes obvious:
- mirror created versus mirror refreshed
- Addy skill imported versus skipped due to collision
- symlink created versus copy fallback
- global rules linked

## Non-Goals

Out of scope for this consolidation:
- adding new command-line modes or flags
- renaming `sync-agents.sh`
- changing the generated-tree layout
- changing merge precedence
- replacing symlink-first behavior with copy-first behavior
- adding long-running processes or dev servers

## Acceptance Criteria

- `./sync-agents.sh` is the only maintained shell entrypoint for the sync workflow.
- Running `./sync-agents.sh` on a fresh repo clone creates missing upstream mirrors, rebuilds the generated tree, installs runtime paths, and links global rules.
- Running `./sync-agents.sh` on an existing setup refreshes everything to the latest upstream state plus local overrides.
- A skill unique to `agent-skills` appears in `superpowers-agents/skills` after sync.
- A colliding skill name keeps the Superpowers version in `superpowers-agents/skills`.
- `custom/skills` still overrides both upstream sources.
- `~/.agents` still points to the generated agent tree.
- `~/.claude/skills` still uses symlink-first, copy-fallback behavior.
- Global rules still link into all configured CLI targets.
- The README reflects the single-script workflow.
- Tests verify the consolidated script without depending on the deleted companion scripts.

## Testing Expectations

Implementation planning should cover:
- updating all current fixture-based shell tests to use only `sync-agents.sh`
- keeping merge-import and collision-priority regression coverage
- keeping idempotency coverage
- keeping Claude symlink-fallback coverage
- preserving coverage for missing-upstream repair behavior, even though the behavior now runs through one script

The verification path should remain repo-local shell tests and shell syntax checks.
