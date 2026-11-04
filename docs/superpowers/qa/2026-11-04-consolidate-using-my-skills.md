# QA Report — Consolidate meta-skills into `using-my-skills` (2026-11-04)

## Scope

Merged `custom/skills/using-agent-skills` (lifecycle router) and
`custom/skills/using-my-agents-skill` (bridge/orchestrator) into one custom
meta-skill `using-my-skills`, simplifying the process per user direction.

## Changes

- `custom/skills/using-my-skills/SKILL.md`: single entry point combining
  - discipline gate absorbed from upstream `using-superpowers`
    (invoke-before-acting, 1% rule, priority order, red-flags table,
    SUBAGENT-STOP)
  - lifecycle routing flowchart + Task→Skill patterns table (deduped from both
    sources, surviving-skill names only)
  - simplified execution model: trivial → inline; minor update → one impl
    sub-agent + QA; big task → orchestrator + synchronous per-ticket loop
    (one cheap impl + dedicated QA) with `.superpowers/` checkpoint tracking;
    parallel sub-agents ONLY on explicit user request for fast iteration
  - final quality gate (review → simplify → clean → verify) and core operating
    behaviors retained
- `references/definition-of-done.md` moved via `git mv` (history kept).
- `custom/skills/using-agent-skills/` + `using-my-agents-skill/` deleted.
- `AGENTS.md`: layout line now names `using-my-skills`.
- `.superpowers/CURRENT_TASK.md`: checkpoint updated to this task.
- Historical docs under `docs/superpowers/` intentionally untouched.

## Verification

- `./sync-agents.sh` real run: clean (fetch + rebuild + relink), twice.
- Generated tree: 22 skills (was 23); `using-my-skills` present with SKILL.md +
  references; `using-agent-skills`/`using-my-agents-skill` absent.
- Harness links verified: `~/.agents`, `~/.claude/skills`, per-skill links in
  `~/.codex/skills`, `~/.gemini/skills`, `~/.codeium/windsurf/skills` — stale
  links for both old names removed, `using-my-skills` linked.
- `tests/test-sync-agents-idempotent.sh`: PASS.

## Incidents / fixes during work

- `git rm -r` left an empty `custom/skills/using-agent-skills/references/`
  skeleton; `cp -R` then propagated a SKILL.md-less phantom dir into the
  generated tree and prevented stale-link cleanup. Removed the leftover and
  re-ran sync; all clean. Worth noting: `rebuild_generated_skills` could guard
  against empty skill dirs (follow-up candidate).

## Limitations

- No pressure-scenario subagent testing (writing-skills TDD) on the merged
  content — verified structurally and by sync behavior only.
- Trivial-task "do it inline" tier inferred from user direction (they specified
  minor/big only); flagged as an assumption.
- `using-superpowers` remains in the catalog (upstream fork skill) but is no
  longer a required invoke — its discipline rules are absorbed inline.

## Risks

- Other docs/sessions referencing the old skill names will 404 on reload —
  expected; the announce line and routing table cover rediscovery.
