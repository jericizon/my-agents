---
name: using-my-skills
description: Use at the start of every task-oriented invocation, including simple, narrow, single-skill, follow-up, and delegated tasks. The single entry point that enforces skill discipline, routes the task to the right skills, and governs execution.
---

# Using My Skills

<SUBAGENT-STOP>
If you were dispatched as a subagent to execute a specific task, ignore this skill.
</SUBAGENT-STOP>

## Overview

This is the single entry point for task-oriented work. It does three jobs:

1. **Discipline gate** — a relevant skill is invoked BEFORE any response or action.
2. **Lifecycle router** — maps the task to the right phase skills.
3. **Execution governor** — decides how the work runs: inline, minimal pipeline, or orchestrated.

Do NOT use only when the turn contains no task request: pure acknowledgements,
standalone explanations, unrelated conversation.

## The Rule

<EXTREMELY-IMPORTANT>
If there is even a 1% chance a skill might apply to what you are doing, you MUST invoke it. This is not negotiable.
</EXTREMELY-IMPORTANT>

Invoke relevant or requested skills BEFORE any response or action — including clarifying questions, exploring the codebase, or checking files. Then announce `Using [skill] to [purpose]` and follow it exactly. If the skill turns out wrong for the situation, you don't have to keep using it.

**Priority order:** user instructions (AGENTS.md, direct requests) > skills > defaults. Only skip a skill workflow when the user has explicitly said so. When multiple skills apply, process skills (brainstorming, systematic-debugging, writing-plans) come before implementation skills.

## Task Routing

```
Task arrives
    │
    ├── Vague idea / unclear intent? ─────→ brainstorming (clarity gate — see below)
    ├── Have requirements, need a plan? ──→ writing-plans
    ├── Executing a plan? ────────────────→ executing-plans
    ├── Need an isolated workspace? ──────→ using-git-worktrees
    ├── UI / visual design work? ────────→ ui-ux-pro-max (design data, always first)
    │   └── Redesign / upgrade existing UI? → using-my-designer (audit-first)
    ├── Writing/running tests? ──────────→ test-driven-development
    ├── Something broke? ────────────────→ systematic-debugging
    ├── Reviewing code? ─────────────────→ requesting-code-review
    │   └── Processing feedback? ───────→ receiving-code-review
    ├── Live app / real-user QA? ────────→ using-my-qa
    ├── Demo recording? ─────────────────→ client-demo-presentation
    │   └── Per-feature demo set? ──────→ demo-the-updates
    ├── About to claim "done"? ──────────→ verification-before-completion
    ├── Ready to merge/integrate? ───────→ finishing-a-development-branch
    ├── Writing or editing a skill? ─────→ writing-skills
    └── Session went wrong? ─────────────→ diagnosing-superpowers
```

Take the union of applicable skills, then prune to the smallest effective set — over-applying skills is a failure, not thoroughness. Order by phase: understand → plan → build → validate → ship.

## Execution Model

Classify the task, then pick the smallest pipeline that fits:

| Task size | Pipeline |
|-----------|----------|
| Trivial (typo, rename, single obvious edit) | Do it inline. No sub-agents. |
| Minor update (narrow scope, one concern) | One implementation sub-agent + QA validation. No orchestrator. |
| Big task (decomposes into subtasks) | Orchestrator + synchronous ticket loop below. |
| Fast iteration | Parallel sub-agents — ONLY when the user explicitly asks for quick/fast development in their prompt. Never assume it. |

### Big-task pipeline (synchronous)

1. Designate exactly one **orchestrator**. It clarifies ambiguity, writes the spec and per-ticket plans (`brainstorming` → `writing-plans`), maps file ownership, and maintains the durable checkpoint at `<project shared dir>/.superpowers/CURRENT_TASK.md` (see the task-continuity policy — update it after each milestone, when blocked, and before interruptions).
2. For each ticket, **synchronously**: orchestrator hands a scoped subtask + acceptance criteria to **one implementation sub-agent** → dedicated **QA sub-agent** validates → orchestrator updates the checkpoint, then the next ticket starts. Sequential by default; no parallel fan-out.
3. One **dedicated QA sub-agent** per workstream, kept across it. It invokes `using-my-qa`, gets clarified intent, acceptance criteria, diffs, risks, and environment prerequisites, and reports files/behavior/evidence — never a bare "passed".
4. QA failure → route finding + evidence back to the implementation sub-agent, re-validate. Cap at three fix cycles per workstream, then stop and escalate with evidence.
5. **Fast mode** (explicit user request only): multiple implementation sub-agents may run in parallel, but two tickets touching the same file never run concurrently.

### Model tiers

Cheap hands, expensive heads. Implementation sub-agents run on the harness's lowest capable tier; the orchestrator and QA sub-agent run on its frontier tier. Resolve tiers through the active harness — Devin CLI → `devin models list` (cheapest for implementation, frontier for orchestrator/QA); other harnesses → their equivalents. Step a fix up one tier only when the cheap model can't reason it through.

## Final Quality Gate (code changes)

Non-prunable for any task that changes code, tests, config, schemas, build/deploy, or skill/runtime logic:

1. **Review** — `requesting-code-review` against scope, acceptance criteria, security, regressions.
2. **Simplify** — remove unnecessary complexity, duplication, indirection without changing behavior.
3. **Clean** — remove clearly safe dead code/deps/artifacts (never remove on assumption alone).
4. **Verify** — `verification-before-completion` on the post-cleanup state: tests scoped to changed files, required real-user/manual validation.

If any stage fails or is skipped, do not claim completion. Documentation-only, explanation-only, and investigation-only tasks use task-appropriate validation instead. Every change must also clear the standing Definition of Done — see `references/definition-of-done.md`.

## Core Operating Behaviors

Non-negotiable, across all skills:

1. **Surface assumptions.** State them explicitly before non-trivial work; don't silently fill gaps.
2. **Manage confusion.** On inconsistency: STOP, name it, ask, wait. Never proceed on a guess.
3. **Push back when warranted.** Flag clear problems with concrete downsides and an alternative. Accept an informed override.
4. **Enforce simplicity.** Prefer the boring, obvious solution; abstractions must earn their complexity.
5. **Scope discipline.** Touch only what was asked; no drive-by refactors, no deleting what you don't understand.
6. **Verify, don't assume.** "Seems right" is never sufficient — evidence (tests, build, runtime) or it's not done.

## Task → Skill Patterns

| Task type | Efficient combination (after pruning) |
|-----------|----------------------------------------|
| New feature | brainstorming → writing-plans → executing-plans → test-driven-development → verification-before-completion |
| Bug fix | systematic-debugging → test-driven-development → verification-before-completion |
| Refactor | writing-plans → executing-plans → test-driven-development → verification-before-completion |
| Frontend / landing page (new build) | brainstorming → ui-ux-pro-max → implementation → using-my-qa |
| Redesign / upgrade existing UI | brainstorming → ui-ux-pro-max → using-my-designer → implementation → using-my-qa |
| Product UI (dashboards, admin, app screens) | brainstorming → ui-ux-pro-max → implementation → using-my-qa |
| Styling / visual polish / charts | ui-ux-pro-max |
| Browser / live QA | using-my-qa |
| Demo recording | client-demo-presentation or demo-the-updates |
| Ship / release | finishing-a-development-branch → verification-before-completion |

## Red Flags

These thoughts mean STOP — you're rationalizing:

| Thought | Reality |
|---------|---------|
| "This is just a simple question" | Questions are tasks. Check for skills. |
| "I need more context first" | Skill check comes BEFORE clarifying questions. |
| "Let me explore the codebase first" | Skills tell you HOW to explore. Check first. |
| "The skill is overkill" | Simple things become complex. Use it. |
| "I remember this skill" | Skills evolve. Read current version. |
| "I'll just do this one thing first" | Check BEFORE doing anything. |
| "This doesn't need sub-agents" | Correct for trivial/minor tasks — classify first. |
| "Faster to parallelize" | Parallel sub-agents require an explicit user request. |

## Common Mistakes

- Skipping the skill check and diving into files or clarifying questions.
- Selecting the full union without pruning.
- Running `brainstorming` on a self-contained instruction — or skipping it on a vague one.
- Spawning parallel sub-agents without an explicit fast-iteration request from the user.
- Running implementation on a frontier model.
- Accepting a QA report that only says "passed" — it must include files, behavior, evidence.
- Skipping the final quality gate on a code change.
- Designing UI from memory instead of querying `ui-ux-pro-max` first.
