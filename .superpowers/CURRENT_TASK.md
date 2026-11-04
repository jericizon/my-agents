# Current Task Checkpoint

## Task ID and Title

TASK-2026-11-04-01 — Rework agent skills: remove agent-skills-fork

## Original Objective

Remove the `agent-skills-fork` upstream mirror (addyosmani/agent-skills) from the
sync pipeline and drop its 25 imported skills from the generated tree. Keep
`superpowers-fork` and `ui-ux-fork` mirrors. Vendor `using-agent-skills` into
`custom/skills` so the `using-my-agents-skill` bridge keeps its lifecycle router.

## Acceptance Criteria

1. `agent-skills-fork/` directory and gitlink removed; forks gitignored.
2. `sync-agents.sh` has no agent-skills mirror/import logic; rebuild produces
   only superpowers + ui-ux-pro-max + custom skills.
3. `custom/skills/using-agent-skills/` is self-contained (no `../..` refs) and
   routes only to surviving skills.
4. `using-my-agents-skill` and `shared/rules/global_rules.md` reference only
   surviving skill names.
5. README.md + AGENTS.md describe the new layout.
6. Agent-skills-specific tests deleted; remaining tests updated and passing.
7. `./sync-agents.sh` runs clean; generated tree contains expected skill set.

## Current Status

COMPLETED

## Harness and Session Identifier

devin-cli, workspace /home/jeric/Workspace/my-agents, branch feat/light-demo-canvas

## Progress Log

- 2026-11-04: Investigated pipeline; user chose: drop all 25 agent-skills,
  keep superpowers/ui-ux mirrors, vendor using-agent-skills.
