# My Agents

Local manager for Superpowers skills with:
- a repo-local skills mirror at `superpowers-agents/skills`
- optional local overrides at `custom/skills`
- an upstream fork mirror at `superpowers-fork`

The scripts in this repo keep `~/.agents` pointed at this workspace so Codex can discover skills.

## Requirements

- `bash`
- `git`
- `npm` (only needed for some test suites)

## Repository Layout

- `superpowers-agents/skills/`: active skills used by Codex
- `custom/skills/`: your local custom/override skills (copied on setup/update)
- `superpowers-fork/`: upstream mirror used as update source
- `setup-agents.sh`: link local `superpowers-agents` to `~/.agents`
- `setup-superpowers-fork.sh`: clone/update fork and sync skills
- `update-skills.sh`: pull latest upstream skills and reapply custom skills

## Quick Start

1. Clone this repo.
2. From repo root, run:

```bash
./setup-superpowers-fork.sh
```

This will:
- clone or update `superpowers-fork`
- copy fork skills into `superpowers-agents/skills`
- copy `custom/skills/*` into `superpowers-agents/skills`
- create `~/.agents -> <this-repo>/superpowers-agents` (with backup if `~/.agents` exists)

## Daily Update Flow

Run:

```bash
./update-skills.sh
```

This will:
- fetch latest `upstream/main` in `superpowers-fork`
- reset local fork mirror to that upstream state
- refresh `superpowers-agents/skills`
- reapply `custom/skills/*`
- refresh the `~/.agents` symlink

If `~/.agents` already exists, the script prompts:
- `y`: backup first to `~/.agents.backup.<timestamp>`
- `N` or Enter: do not backup and override existing `~/.agents` (default)

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
