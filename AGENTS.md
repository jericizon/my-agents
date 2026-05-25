# Repository Guidelines

## Project Structure & Module Organization
This repository manages agent skills and a local fork of Superpowers.

- `superpowers-agents/skills/`: active repo-local skill definitions (`*/SKILL.md`, optional `scripts/`, `references/`, `examples/`).
- `custom/skills/`: local overrides/additions copied into `superpowers-agents/skills` during setup/update.
- `superpowers-fork/`: upstream fork mirror with source skills, docs, scripts, and tests.
- Root scripts: `setup-agents.sh`, `setup-superpowers-fork.sh`, `update-skills.sh`.

Keep new skills in `custom/skills/<skill-name>/SKILL.md` and mirror the existing folder pattern.

## Build, Test, and Development Commands
Run from repository root unless noted.

- `./setup-agents.sh`: links this repo’s `superpowers-agents` to `~/.agents` (backs up existing target).
- `./setup-superpowers-fork.sh`: clones/updates `superpowers-fork`, copies skills into `superpowers-agents/skills`, then relinks `~/.agents`.
- `./update-skills.sh`: refreshes from `upstream/main`, replaces `superpowers-agents/skills`, reapplies `custom/skills`.
- `bash superpowers-fork/tests/claude-code/run-skill-tests.sh`: runs core Claude Code skill tests.
- `bash superpowers-fork/tests/claude-code/run-skill-tests.sh --integration`: includes slower integration coverage.
- `cd superpowers-fork/tests/brainstorm-server && npm test`: runs Node test for brainstorm server harness.

## Coding Style & Naming Conventions
- Shell: use `#!/usr/bin/env bash` and strict mode (`set -e` or `set -euo pipefail`).
- Indentation: 2 spaces for Markdown lists, 4 spaces for shell continuation blocks.
- Skill folders: kebab-case names (example: `systematic-debugging`).
- Required entrypoint: `SKILL.md` in each skill directory.
- Script names: verb-first kebab-case (`update-skills.sh`, `run-skill-tests.sh`).

## Implementation Rules
- Before changing code, scan the relevant codebase paths and confirm the target code exists.
- When creating or modifying code, make it reusable by default.
- Prefer the smallest reusable change that matches current patterns.
- Avoid new abstractions unless existing repetition proves they are needed.
- Choose simple code over clever code; no overengineering.

## Testing Guidelines
- Prefer targeted tests first, then integration tests before PR.
- Keep test filenames explicit: `test-<behavior>.sh` or `<component>.test.js`.
- For shell test changes, run the matching script under `superpowers-fork/tests/` and capture pass/fail output in PR notes.

## Commit & Pull Request Guidelines
This repo currently has no committed history on `main`; use Conventional Commits going forward.

- Commit format: `type(scope): summary` (example: `feat(skills): add qa-testing override`).
- Keep commits focused by concern (setup scripts, skills, tests, docs).
- PRs should include: purpose, changed paths, test commands run, and rollback notes for symlink-affecting changes.
- Include screenshots only when UI/docs rendering behavior changed.
