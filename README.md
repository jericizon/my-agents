# My Agents

Local manager for Superpowers skills with:
- a repo-local generated skills mirror at `superpowers-agents/skills`
- optional local overrides at `custom/skills`
- an upstream fork mirror at `superpowers-fork`

The scripts in this repo keep `~/.agents` pointed at this workspace so Codex can discover skills.

## Requirements

- `bash`
- `git`
- `npm` (only needed for some test suites)

## Repository Layout

- `superpowers-agents/skills/`: generated sync target used by Codex at runtime
- `custom/skills/`: editable local custom/override skills copied into the generated mirror on setup/update
- `superpowers-fork/`: upstream mirror used as update source
- `setup-agents.sh`: link local `superpowers-agents` to `~/.agents`
- `setup-superpowers-fork.sh`: clone/update fork and sync skills
- `update-skills.sh`: pull latest upstream skills and reapply custom skills
- `install-global-rules.sh`: link one shared global rules file into multiple CLI config locations
- `sync-agents.sh`: one command for fresh install or updates (always updates both skills and global rules)

## Quick Start (Single Command)

1. Clone this repo.
2. From repo root, run:

```bash
./sync-agents.sh
```

This will:
- run first-time setup if needed (`superpowers-fork` clone + initial sync)
- always update skills from upstream and reapply custom skills
- always update global rules links across configured CLIs
- copy fork skills into `superpowers-agents/skills`
- copy `custom/skills/*` into `superpowers-agents/skills`
- create/refresh `~/.agents -> <this-repo>/superpowers-agents`

Important:
- `superpowers-agents/skills` is generated output and is gitignored in this repo
- make persistent skill edits under `custom/skills`, not under `superpowers-agents/skills`

## Daily Update Flow

Recommended:

```bash
./sync-agents.sh
```

This will:
- always run skill updates and global rules updates in one pass

Manual mode (if needed):

```bash
./update-skills.sh
./install-global-rules.sh
```

If `~/.agents` already exists, the script prompts:
- `y`: backup first to `~/.agents.backup.<timestamp>`
- `N` or Enter: do not backup and override existing `~/.agents` (default)

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

Your custom skill will be copied into `superpowers-agents/skills`.

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
- `custom/skills` is your safe place for local changes that should survive updates.
- `superpowers-agents/skills` is intentionally regenerated on sync and should not be treated as a hand-edited source directory.
