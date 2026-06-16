---
name: using-my-agents-skill
description: Use at the start of any task or conversation as the single entry point for skill discovery. Triggers both using-superpowers and using-agent-skills, reconciles their recommendations, and selects the most efficient combination of skills for the task at hand.
---

# Using My Agents Skill

## Overview

This is the **bridge meta-skill**. It is the single entry point that activates the two underlying discovery skills, reconciles what each recommends, and combines them into one efficient, de-duplicated plan for the current task.

Two discovery sources exist in this setup:
- **using-superpowers** — the discipline gate. Enforces "invoke a skill before acting" and resolves instruction priority.
- **using-agent-skills** — the lifecycle router. Maps a task to a development-phase skill and the typical skill sequence.

Run alone, each gives a partial view. This skill runs both, merges the result, and drops redundant or low-value skills so you apply the smallest set that produces the best result.

## When to Use

Use when:
- a new task or conversation begins and you need to decide which skills apply
- a task spans multiple phases (e.g. design → build → test → ship)
- both meta-skills might recommend overlapping skills and you need one reconciled plan
- you want the strongest result with the fewest, most relevant skills

Do NOT use when:
- you were dispatched as a subagent to execute one narrow, already-scoped task
- a single specific skill is obviously and exclusively the right one (invoke it directly)

## Workflow

```
Task arrives
    │
    ├─ 1. Invoke using-superpowers   → discipline + instruction priority + 1% rule
    ├─ 2. Invoke using-agent-skills  → lifecycle phase + candidate skills
    ├─ 3. Classify the task          → BUGFIX / FEATURE / REFACTOR / TEST / REVIEW / SHIP / INVESTIGATE
    ├─ 4. Merge candidate lists      → union of skills both meta-skills surface
    ├─ 5. Reconcile & prune          → dedup overlaps, drop skills that add no value for THIS task
    ├─ 6. Order: process → implementation → verify → ship
    └─ 7. Announce the combined plan, then follow each selected skill exactly
```

## Reconciliation Rules

1. **Always run both meta-skills first.** Never select skills from only one source. The discipline gate (using-superpowers) and the lifecycle router (using-agent-skills) cover different blind spots.

2. **Union, then prune.** Collect every skill either source surfaces, then remove any that does not earn its place for the current task. Smallest effective set wins — applying ten skills to a one-line fix is a failure, not thoroughness.

3. **De-duplicate by intent, not by name.** Some skills exist in both catalogs. Pick one instance and apply it once.

4. **Order by phase:** process/understanding skills first (brainstorming, debugging, spec, planning), then implementation, then verification, then review, then ship. A task is not done until its verification skill passes.

5. **Honor the 1% rule from using-superpowers.** If there is even a 1% chance a skill applies, include it in the candidate list before pruning.

6. **User instructions outrank everything.** If the user (or CLAUDE.md / AGENTS.md) says skip a workflow, skip it. This bridge never overrides explicit user intent.

7. **Prefer the more specific skill on conflict.** A domain skill (e.g. frontend-ui-engineering) beats a generic one when both cover the same step.

## Task → Combined Skill Patterns

| Task type | Efficient combination (after pruning) |
|-----------|----------------------------------------|
| New feature | brainstorming → spec-driven-development → planning-and-task-breakdown → incremental-implementation → test-driven-development → code-review-and-quality |
| Bug fix | systematic-debugging / debugging-and-error-recovery → test-driven-development → code-review-and-quality |
| Refactor | code-simplification → test-driven-development → code-review-and-quality |
| Vague idea | interview-me → idea-refine → spec-driven-development |
| Security-sensitive | security-and-hardening → doubt-driven-development → code-review-and-quality |
| Browser / UI QA | comprehensive-qa-testing or browser-testing-with-devtools |
| Ship / release | git-workflow-and-versioning → verification-before-completion → shipping-and-launch |

These are starting points. Always prune to what the specific task needs.

## Announce Format

After reconciling, state the plan in one line before acting:

```
Using my-agents bridge: [skill-a] → [skill-b] → [skill-c] (pruned from [N] candidates).
```

Then invoke and follow each selected skill exactly, in order.

## Common Mistakes

- **Running only one meta-skill.** You lose half the coverage. Always run both.
- **Selecting the full union without pruning.** Over-applying skills wastes effort and obscures the real work.
- **Re-implementing a skill's steps here.** This bridge only routes and combines; the selected skills own their own steps.
- **Skipping verification.** Every combined plan must end with a verification or review skill before claiming completion.
