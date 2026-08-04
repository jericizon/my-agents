# Using My Agents Final Quality Gate QA

## Scope

Validate the final quality gate added to `custom/skills/using-my-agents-skill/SKILL.md` for tasks that change source code, tests, scripts, configuration, schemas, build/deployment logic, or skill/runtime logic.

## Static acceptance results

- The gate is required after implementation and task-specific validation, immediately before completion or shipping.
- The gate is additive and non-prunable, including for small, obvious, single-skill, delegated, or previously QA-validated tasks.
- The required order is:
  1. `code-review-and-quality`
  2. `code-simplification`
  3. Dead/unnecessary code, dependency, branch, test, and artifact checks
  4. `verification-before-completion` against the post-cleanup state
- The orchestrator must record review findings, cleanup decisions, dead-code findings, verification evidence, QA outcomes, limitations, and unresolved risks.
- Any failed, skipped, unavailable, or unreported stage blocks a completion claim.
- Documentation-only, explanation-only, and investigation-only tasks remain outside the code-quality gate while still requiring task-appropriate validation.
- Existing exactly-one-orchestrator and exactly-one-QA-owner requirements remain present.
- Source and generated skill copies match.

## Validation evidence

```text
git diff --check: PASS
source/generated cmp: PASS
final quality-gate static checks: PASS (10/10)
```

Runtime pressure testing was not available because the Claude Code harness authentication was previously blocked. Static validation does not prove that an agent will follow the gate under pressure; no runtime compliance claim is made.
