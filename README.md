# My Agents

Local manager for Superpowers skills with:
- a repo-local merged generated skills mirror at `superpowers-agents/skills`
- optional local overrides at `custom/skills`
- an upstream Superpowers mirror at `superpowers-fork`
- an upstream Addy Osmani `agent-skills` mirror at `agent-skills-fork`
- an upstream `ui-ux-pro-max-skill` mirror at `ui-ux-fork` (only the `ui-ux-pro-max` skill is imported)

The scripts in this repo keep one generated skills source in this workspace, then expose it to both Codex and Claude Code.

## Requirements

- `bash`
- `git`
- `npm` (only needed for some test suites)

## Repository Layout

- `superpowers-agents/skills/`: generated sync target used as the shared runtime skill source
- `custom/skills/`: editable local custom/override skills copied into the generated mirror on setup/update
- `superpowers-fork/`: upstream Superpowers mirror used as one update source
- `agent-skills-fork/`: upstream Addy Osmani `agent-skills` mirror used as a second update source
- `ui-ux-fork/`: upstream `nextlevelbuilder/ui-ux-pro-max-skill` mirror; its skills live under `.claude/skills/` and only the names in `UI_UX_SKILL_ALLOWLIST` are imported
- `sync-agents.sh`: the only maintenance entrypoint; clones or refreshes all upstream mirrors, rebuilds generated skills, refreshes runtime links, and links global rules

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
  1. `superpowers-fork/skills`
  2. `agent-skills-fork/skills` for non-conflicting skill names only
  3. `ui-ux-fork/.claude/skills` for allowlisted, non-conflicting skill names only
  4. `custom/skills/*`
- create/refresh `~/.agents -> <this-repo>/superpowers-agents`
- create/refresh `~/.claude/skills -> <this-repo>/superpowers-agents/skills`
- fall back to copying into `~/.claude/skills` only if the Claude symlink cannot be created

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

New device flow:
1. Pull this repository.
2. Run `./sync-agents.sh`

Any future edits to `shared/rules/global_rules.md` immediately apply to all linked CLIs.

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
1. `superpowers-fork/skills`
2. `agent-skills-fork/skills` for non-conflicting skill names only
3. `ui-ux-fork/.claude/skills` for allowlisted, non-conflicting skill names only
4. `custom/skills`

If a skill exists in more than one upstream mirror, the earlier source in this list wins unless you override it in `custom/skills`.

To import more skills from the `ui-ux-pro-max-skill` repo (it ships `ui-styling`, `design`, `design-system`, `brand`, `slides`, `banner-design`), add their names to `UI_UX_SKILL_ALLOWLIST` in `sync-agents.sh`.

## Tests

From repo root:

```bash
bash superpowers-fork/tests/claude-code/run-skill-tests.sh
```

Integration run:

```bash
bash superpowers-fork/tests/claude-code/run-skill-tests.sh --integration
```

Brainstorm harness test:

```bash
cd superpowers-fork/tests/brainstorm-server && npm test
```

## Notes

- `sync-agents.sh` intentionally runs `git reset --hard upstream/main` inside all local upstream mirrors to keep them clean.
- `custom/skills` is your safe place for local changes that should survive updates.
- `superpowers-agents/skills` is intentionally regenerated on sync and should not be treated as a hand-edited source directory.
- Claude Code should read the same generated tree via `~/.claude/skills`, or receive a refreshed copy there if symlinks are unavailable.
