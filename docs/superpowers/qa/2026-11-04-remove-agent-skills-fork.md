# QA Report — Remove agent-skills-fork (2026-11-04)

## Scope

Removed the `addyosmani/agent-skills` upstream mirror from the sync pipeline.
Generated tree shrank from 46 → 23 skills (superpowers 15 + ui-ux-pro-max +
custom overrides/additions). `using-agent-skills` vendored into `custom/skills`
so `using-my-agents-skill` keeps its lifecycle router.

## Changes

- `agent-skills-fork/` deleted; gitlinks for all three forks removed from the
  index (they had no `.gitmodules` — broken submodule entries); fork dirs now
  gitignored. `setup_mirror_repo` still clones them on fresh machines.
- `sync-agents.sh`: dropped `AGENT_SKILLS_*` vars, mirror setup/refresh, merge
  step, and status echo.
- `custom/skills/using-agent-skills/`: vendored SKILL.md (routing tables
  rewritten to surviving skills) + `references/definition-of-done.md` (dead
  skill refs re-pointed; link made self-contained).
- `custom/skills/using-my-agents-skill/SKILL.md`: clarity gate
  `interview-me` → `brainstorming`; quality gate → `requesting-code-review` +
  `verification-before-completion`; Task→Skill table rewritten to surviving set.
- `shared/rules/global_rules.md`: skill selection table rewritten to real skills.
- `custom/skills/brainstorming/SKILL.md`: removed `frontend-design` reference.
- `README.md`, `AGENTS.md`: updated layout/precedence; AGENTS.md rewritten to
  match reality (was referencing deleted setup scripts).
- Tests: deleted `test-agent-skills-import.sh`, `test-agent-skills-priority.sh`
  (obsolete); removed addy fixtures from 3 tests; added missing
  `shared/policy` + ui-ux fixtures (pre-existing gaps).

## Verification

- `bash -n` clean on sync-agents.sh + all test scripts.
- `test-sync-agents-idempotent.sh`: PASS (offline fixtures).
- `test-claude-skills-copy-fallback.sh`: PASS.
- `test-update-skills-missing-upstream.sh`: PASS.
- `./sync-agents.sh` real run: clean; fetched latest superpowers v7.0.2 +
  ui-ux; rebuilt tree; `~/.agents`, `~/.claude/skills`, rules, policy links
  verified.
- Generated tree contains exactly the expected 23 skills; all 24 imported
  agent-skills confirmed absent; no dead-skill references remain in
  `custom/skills` or `shared/rules`.

## Known issues (pre-existing, unrelated)

- `test-qa-skill-artifact-guidance.sh`, `test-playwright-e2e-skill-priority.sh`,
  `test-creating-playwright-e2e-tests-guidance.sh`,
  `test-custom-writing-guidance.sh` fail: they assert custom skills
  (`qa-execution`, `creating-playwright-e2e-tests`) deleted in an earlier
  commit. Flag for follow-up — either restore the skills or delete the tests.
- `docs/superpowers/plans|specs/*agent-skills*.md` still mention the fork —
  historical records, intentionally left.

## Risks

- Anyone re-adding agent-skills upstream must re-vendor or restore the mirror
  step deliberately; `using-agent-skills` no longer tracks upstream (by design).
