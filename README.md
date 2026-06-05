# My Agents

Local manager for Superpowers skills with:
- a repo-local merged generated skills mirror at `superpowers-agents/skills`
- optional local overrides at `custom/skills`
- an upstream Superpowers mirror at `superpowers-fork`
- an upstream Addy Osmani `agent-skills` mirror at `agent-skills-fork`

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
- `setup-agents.sh`: install runtime paths for Codex and Claude Code from the local generated skills mirror
- `setup-superpowers-fork.sh`: clone/update both upstream mirrors and trigger a generated-tree rebuild
- `update-skills.sh`: pull latest upstream skills from both mirrors, merge them into the generated tree, and reapply custom skills
- `install-global-rules.sh`: link one shared global rules file into multiple CLI config locations
- `sync-agents.sh`: one command for fresh install or updates (always updates both skills and global rules)

## Quick Start (Single Command)

1. Clone this repo.
2. From repo root, run:

```bash
./sync-agents.sh
```

This will:
- run first-time setup if needed (`superpowers-fork` and `agent-skills-fork` clone + initial sync)
- always update both upstream mirrors and reapply custom skills
- always update global rules links across configured CLIs
- rebuild `superpowers-agents/skills` from:
  1. `superpowers-fork/skills`
  2. `agent-skills-fork/skills` for non-conflicting skill names only
  3. `custom/skills/*`
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
- always run both upstream skill updates, rebuild the merged generated tree, and refresh global rules in one pass

Manual mode (if needed):

```bash
./update-skills.sh
./install-global-rules.sh
```

If `~/.agents` or `~/.claude/skills` already exists, the installer backs it up to `*.backup.<timestamp>` before replacing it.

## Global Rules Across CLIs

Canonical global rules file in this repo:

```text
shared/rules/global_rules.md
```

Install for configured CLIs:

```bash
./install-global-rules.sh
```

This script creates symlinks (with automatic backups if a target file exists) for:
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
./update-skills.sh
```

Your custom skill will be copied into `superpowers-agents/skills`, which is then exposed to both Codex and Claude Code.

Merge precedence is:
1. `superpowers-fork/skills`
2. `agent-skills-fork/skills` for non-conflicting skill names only
3. `custom/skills`

If a skill exists in both upstream mirrors, the Superpowers version is retained unless you override it in `custom/skills`.

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

- `update-skills.sh` intentionally runs `git reset --hard upstream/main` inside `superpowers-fork` to keep the mirror clean.
- `update-skills.sh` intentionally runs `git reset --hard upstream/main` inside both local upstream mirrors to keep them clean.
- `custom/skills` is your safe place for local changes that should survive updates.
- `superpowers-agents/skills` is intentionally regenerated on sync and should not be treated as a hand-edited source directory.
- Claude Code should read the same generated tree via `~/.claude/skills`, or receive a refreshed copy there if symlinks are unavailable.
