# Repository Guidelines

## Project Structure & Module Organization
This repository manages the agent skills catalog: upstream mirrors, local overrides, and one generated runtime tree.

- `forks/`: upstream mirror clones, gitignored and managed by `sync-agents.sh`.
  - `forks/superpowers-fork/`: mirror of `obra/superpowers` (primary skill source, 15 skills).
  - `forks/ui-ux-fork/`: mirror of `nextlevelbuilder/ui-ux-pro-max-skill`; only names in `UI_UX_SKILL_ALLOWLIST` (currently `ui-ux-pro-max`) are imported from `.claude/skills/`.
- `custom/skills/`: editable local skills and overrides copied into the generated tree last (wins all name conflicts). `using-agent-skills` is vendored here.
- `superpowers-agents/skills/`: generated merge target, gitignored — never edit by hand.
- `shared/rules/global_rules.md`, `shared/policy/TASK_CONTINUITY.md`: canonical global rules and the Universal AI Coding Agent Policy, symlinked into each harness config on sync.
- `sync-agents.sh`: the only maintenance entrypoint (clone/refresh mirrors → rebuild generated tree → relink runtime paths, rules, policy).
- `quota-recovery-controller.sh`, `tests/`, `docs/`, `tasks/`, `.superpowers/`.

Keep new skills in `custom/skills/<skill-name>/SKILL.md` and mirror the existing folder pattern.

## Build, Test, and Development Commands
Run from repository root unless noted.

- `./sync-agents.sh`: refreshes upstream mirrors, rebuilds `superpowers-agents/skills`, refreshes `~/.agents`, `~/.claude/skills`, global rules links, and the policy link.
- `bash tests/test-sync-agents-idempotent.sh`: end-to-end fixture test of the full sync (offline, temp remotes).
- `bash tests/test-claude-skills-copy-fallback.sh`: Claude skills copy fallback when symlink fails.
- `bash tests/test-update-skills-missing-upstream.sh`: missing-`upstream`-remote recovery.
- `bash tests/test-quota-recovery-controller.sh`: recovery controller behavior.
- `bash forks/superpowers-fork/tests/claude-code/run-skill-tests.sh`: upstream core skill tests (`--integration` for slower coverage).

## Coding Style & Naming Conventions
- Shell: use `#!/usr/bin/env bash` and strict mode (`set -e` or `set -euo pipefail`).
- Indentation: 2 spaces for Markdown lists, 4 spaces for shell continuation blocks.
- Skill folders: kebab-case names (example: `systematic-debugging`).
- Required entrypoint: `SKILL.md` in each skill directory.
- Script names: verb-first kebab-case (`sync-agents.sh`, `run-skill-tests.sh`).

## Implementation Rules
- Before changing code, scan the relevant codebase paths and confirm the target code exists.
- When creating or modifying code, make it reusable by default.
- Prefer the smallest reusable change that matches current patterns.
- Avoid new abstractions unless existing repetition proves they are needed.
- Choose simple code over clever code; no overengineering.
- Make persistent skill edits under `custom/skills`, never under `superpowers-agents/skills` (regenerated) or inside the upstream mirror dirs (reset `--hard` on every sync).

## Testing Guidelines
- Prefer targeted tests first, then integration tests before PR.
- Keep test filenames explicit: `test-<behavior>.sh` or `<component>.test.js`.
- For shell test changes, run the matching script under `tests/` and capture pass/fail output in PR notes.

## Commit & Pull Request Guidelines
Use Conventional Commits.

- Commit format: `type(scope): summary` (example: `feat(skills): add qa-testing override`).
- Keep commits focused by concern (setup scripts, skills, tests, docs).
- PRs should include: purpose, changed paths, test commands run, and rollback notes for symlink-affecting changes.
- Include screenshots only when UI/docs rendering behavior changed.
