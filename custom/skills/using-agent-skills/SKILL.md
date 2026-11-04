---
name: using-agent-skills
description: Discovers and invokes agent skills. Use when starting a session, or when you need to decide which skill or workflow applies to the piece of work at hand. This is the meta-skill that governs how all other skills are discovered and invoked.
---

# Using Agent Skills

## Overview

This is the lifecycle router for the local skills catalog (superpowers core, ui-ux design intelligence, and custom skills under `custom/skills/`). Each skill encodes a specific process. This meta-skill helps you discover and apply the right skill for your current task.

## Skill Discovery

When a task arrives, identify the development phase and apply the corresponding skill:

```
Task arrives
    │
    ├── Vague idea / unclear intent? ─────→ brainstorming
    ├── Have requirements, need a plan? ──→ writing-plans
    ├── Need an isolated workspace? ──────→ using-git-worktrees
    ├── Executing a plan? ────────────────→ executing-plans
    │   ├── Delegating plan tasks? ───────→ subagent-driven-development
    │   └── Independent parallel tasks? ─→ dispatching-parallel-agents
    ├── UI / visual design work? ────────→ ui-ux-pro-max (design data)
    │   └── Landing page / redesign? ────→ design-taste-frontend
    ├── Writing/running tests? ──────────→ test-driven-development
    ├── Something broke? ────────────────→ systematic-debugging
    ├── Reviewing code? ─────────────────→ requesting-code-review
    │   └── Processing feedback? ───────→ receiving-code-review
    ├── Live app / real-user QA? ────────→ real-user-qa
    │   └── Real-browser E2E QA? ───────→ comprehensive-qa-testing
    ├── Demo recording? ─────────────────→ client-demo-presentation
    │   └── Per-feature demo set? ──────→ demo-the-updates
    ├── About to claim "done"? ──────────→ verification-before-completion
    ├── Ready to merge/integrate? ───────→ finishing-a-development-branch
    ├── Writing or editing a skill? ─────→ writing-skills
    └── Superpowers session went wrong? ─→ diagnosing-superpowers
```

## Core Operating Behaviors

These behaviors apply at all times, across all skills. They are non-negotiable.

### 1. Surface Assumptions

Before implementing anything non-trivial, explicitly state your assumptions:

```
ASSUMPTIONS I'M MAKING:
1. [assumption about requirements]
2. [assumption about architecture]
3. [assumption about scope]
→ Correct me now or I'll proceed with these.
```

Don't silently fill in ambiguous requirements. The most common failure mode is making wrong assumptions and running with them unchecked. Surface uncertainty early — it's cheaper than rework.

### 2. Manage Confusion Actively

When you encounter inconsistencies, conflicting requirements, or unclear specifications:

1. **STOP.** Do not proceed with a guess.
2. Name the specific confusion.
3. Present the tradeoff or ask the clarifying question.
4. Wait for resolution before continuing.

**Bad:** Silently picking one interpretation and hoping it's right.
**Good:** "I see X in the spec but Y in the existing code. Which takes precedence?"

### 3. Push Back When Warranted

You are not a yes-machine. When an approach has clear problems:

- Point out the issue directly
- Explain the concrete downside (quantify when possible — "this adds ~200ms latency" not "this might be slower")
- Propose an alternative
- Accept the human's decision if they override with full information

Sycophancy is a failure mode. "Of course!" followed by implementing a bad idea helps no one. Honest technical disagreement is more valuable than false agreement.

### 4. Enforce Simplicity

Your natural tendency is to overcomplicate. Actively resist it.

Before finishing any implementation, ask:
- Can this be done in fewer lines?
- Are these abstractions earning their complexity?
- Would a staff engineer look at this and say "why didn't you just..."?

If you build 1000 lines and 100 would suffice, you have failed. Prefer the boring, obvious solution. Cleverness is expensive.

### 5. Maintain Scope Discipline

Touch only what you're asked to touch.

Do NOT:
- Remove comments you don't understand
- "Clean up" code orthogonal to the task
- Refactor adjacent systems as a side effect
- Delete code that seems unused without explicit approval
- Add features not in the spec because they "seem useful"

Your job is surgical precision, not unsolicited renovation.

### 6. Verify, Don't Assume

Every skill includes a verification step. A task is not complete until verification passes. "Seems right" is never sufficient — there must be evidence (passing tests, build output, runtime data).

Per-skill verification is the local check. The project-wide bar that applies to *every* change, regardless of which skill is active, is the Definition of Done: tests pass, no regressions, behavior verified at runtime, docs updated. See `./references/definition-of-done.md`. It complements each task's acceptance criteria rather than replacing them.

## Failure Modes to Avoid

These are the subtle errors that look like productivity but create problems:

1. Making wrong assumptions without checking
2. Not managing your own confusion — plowing ahead when lost
3. Not surfacing inconsistencies you notice
4. Not presenting tradeoffs on non-obvious decisions
5. Being sycophantic ("Of course!") to approaches with clear problems
6. Overcomplicating code and APIs
7. Modifying code or comments orthogonal to the task
8. Removing things you don't fully understand
9. Building without a plan because "it's obvious"
10. Skipping verification because "it looks right"

## Skill Rules

1. **Check for an applicable skill before starting work.** Skills encode processes that prevent common mistakes.

2. **Skills are workflows, not suggestions.** Follow the steps in order. Don't skip verification steps.

3. **Multiple skills can apply.** A feature implementation might involve `brainstorming` → `writing-plans` → `subagent-driven-development` → `test-driven-development` → `requesting-code-review` → `verification-before-completion` in sequence.

4. **When in doubt, start with a plan.** If the task is non-trivial and there's no plan, begin with `writing-plans`.

## Lifecycle Sequence

For a complete feature, the typical skill sequence is:

```
1.  brainstorming                 → Extract what the user actually wants
2.  writing-plans                 → Break requirements into verifiable tasks
3.  using-git-worktrees           → Isolate the workspace
4.  executing-plans               → Build slice by slice (inline)
    or subagent-driven-development → Delegate plan tasks to sub-agents
5.  test-driven-development       → Prove each slice works
6.  requesting-code-review        → Review before merge
7.  receiving-code-review         → Process review feedback rigorously
8.  verification-before-completion → Evidence before claiming done
9.  finishing-a-development-branch → Merge or PR the work
```

Not every task needs every skill. A bug fix might only need: `systematic-debugging` → `test-driven-development` → `verification-before-completion`.

## Quick Reference

| Phase | Skill | One-Line Summary |
|-------|-------|------------------|
| Define | brainstorming | Surface what the user actually wants before any plan or code |
| Plan | writing-plans | Turn requirements into an ordered, verifiable task plan |
| Plan | using-git-worktrees | Isolate feature work from the current workspace |
| Build | executing-plans | Implement a plan inline, task by task |
| Build | subagent-driven-development | Execute plan tasks via delegated sub-agents |
| Build | dispatching-parallel-agents | Run independent tasks in parallel |
| Build | ui-ux-pro-max | Searchable design data: styles, palettes, fonts, UX guidelines |
| Build | design-taste-frontend | Anti-slop design direction and pre-flight check for visual UI |
| Verify | test-driven-development | Failing test first, then make it pass |
| Verify | systematic-debugging | Reproduce → localize → fix → guard |
| Verify | real-user-qa | Validate real user flows against a live backend |
| Verify | comprehensive-qa-testing | Real-browser end-to-end QA via Playwright |
| Review | requesting-code-review | Get a rigorous review before merging |
| Review | receiving-code-review | Evaluate feedback with technical rigor, not blind agreement |
| Ship | verification-before-completion | Evidence before any "done" claim |
| Ship | finishing-a-development-branch | Decide and execute branch integration |
| Demo | client-demo-presentation | Stakeholder demo video of a validated flow |
| Demo | demo-the-updates | Grouped per-feature demo recordings |
| Meta | writing-skills | Create or edit skills correctly |
| Meta | diagnosing-superpowers | Diagnose why a skills-driven session went wrong |
