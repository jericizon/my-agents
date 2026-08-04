---
name: using-my-agents-skill
description: Use at the start of every task-oriented invocation, including simple, narrow, single-skill, follow-up, and delegated tasks.
---

# Using My Agents Skill

## Overview

This is the **bridge meta-skill**. It is the single entry point that activates the two underlying discovery skills, reconciles what each recommends, and combines them into one efficient, de-duplicated plan for the current task.

Two discovery sources exist in this setup:
- **using-superpowers** — the discipline gate. Enforces "invoke a skill before acting" and resolves instruction priority.
- **using-agent-skills** — the lifecycle router. Maps a task to a development-phase skill and the typical skill sequence.

Run alone, each gives a partial view. This skill runs both, merges the result, and drops redundant or low-value skills so you apply the smallest set that produces the best result.

## When to Use

Use for every task-oriented invocation, regardless of task size, complexity, type, or apparent simplicity:
- a simple, narrow, obvious, or single-skill task
- a multi-phase task (e.g. design → build → test → ship)
- a task handled directly or delegated to another sub-agent
- a task-related clarification, correction, follow-up, or scope change

Do NOT use only when the turn contains no task request:
- pure acknowledgements
- standalone explanations
- unrelated conversation

## Mandatory Orchestration Contract

For every task-oriented invocation, this skill is a required orchestration contract: spawn or designate exactly one orchestrator sub-agent before discovery, implementation, or any other delegation, regardless of task size, complexity, type, simplicity, or whether the task appears to need only one skill. The orchestrator must understand the request, clarify unresolved ambiguity, classify the work, establish acceptance criteria and constraints, map dependencies, and decompose the work before routing implementation subtasks. Do not delegate against unresolved assumptions.

The orchestrator routes scoped subtasks rather than broadcasting the full original message to unrelated agents. Each implementation sub-agent receives its subtask, relevant acceptance criteria, shared feature context, dependencies and prerequisite outputs, applicable skills and constraints, and expected reporting format. All sub-agents report evidence, changed surfaces, blockers, and status to the orchestrator; the orchestrator is the only reporting boundary for the consolidated result.

For each behavior-changing feature, bug fix, or cohesive workstream, designate exactly one dedicated QA sub-agent at workstream start, regardless of the number of dependent implementation tasks. Keep that QA owner across the workstream. Its QA context package includes clarified intent and scope, acceptance criteria and out-of-scope behavior, the task/dependency breakdown, affected surfaces, implementation summaries or diffs, expected real-user workflows, risks and edge cases, automated results, and environment prerequisites. The QA owner invokes `real-user-qa`, validates task checkpoints as prerequisites become available, and performs a final integrated end-to-end pass. Additional QA owners require genuinely independent workstreams, specialized validation expertise, or an explicit user request for parallel QA.

When QA finds a failure, route the finding and evidence to the responsible implementation sub-agent, update shared context, and re-validate. Cap the implementation-to-QA loop at three cycles per feature/workstream; after the third unsuccessful cycle, stop and escalate with attempts, evidence, unresolved risk, and limitations. Completion requires appropriate automated verification and dedicated real-user validation, unless runtime validation is unavailable; report that limitation instead of claiming full QA completion.

Route task-related follow-ups, clarifications, corrections, and scope changes through the same orchestrator and preserve the same QA owner unless the work becomes a separate workstream. Only genuinely non-task turns—pure acknowledgements, standalone explanations, and unrelated conversation—are exempt from orchestration, implementation delegation, and real-user QA.

The orchestrator alone presents the consolidated report to the main agent or user. Include clarified scope, delegated work and dependency status, changed files or behavior, automated evidence, real-user QA scenarios and outcomes, retry count, limitations, risks, and final, blocked, or escalated status.

## Workflow

For every task-oriented invocation, the orchestrator owns or coordinates discovery and reconciliation before any implementation delegation. It must preserve the requirements to invoke both `using-superpowers` and `using-agent-skills`, then route the resulting work through the gates below.

```
Task arrives
    │
    ├─ 1. Spawn/designate exactly one orchestrator before discovery or delegation
    ├─ 2. Orchestrator invokes using-superpowers → discipline + instruction priority + 1% rule
    ├─ 3. Orchestrator invokes using-agent-skills → lifecycle phase + candidate skills
    ├─ 4. Clarity gate → is the instruction vague or ambiguous?
    │   ├─ Yes → run interview-me first, then continue with the clarified intent
    │   └─ No  → proceed with the stated task
    ├─ 5. Classify the task → BUGFIX / FEATURE / REFACTOR / TEST / REVIEW / SHIP / INVESTIGATE
    ├─ 6. Merge candidate lists → union of skills both meta-skills surface
    ├─ 7. Reconcile & prune → dedup overlaps, drop skills that add no value for THIS task
    ├─ 8. Order: process → implementation → task-specific validation → final quality gate → ship
    └─ 9. Announce the combined plan, delegate scoped work, and follow each selected skill exactly
```

## Final Quality Gate for Code Changes

For every task that changes source code, tests, scripts, configuration, schemas, build or deployment logic, or skill/runtime logic, the orchestrator must run this final gate after implementation and task-specific validation, immediately before completion or shipping. The gate is additive and non-prunable: task size, task type, file type, delegation count, prior QA, or an earlier review cannot bypass it.

1. **Review:** Run `code-review-and-quality` against the clarified scope, acceptance criteria, constraints, security, regressions, and existing patterns.
2. **Simplify:** Run `code-simplification` to address unnecessary complexity, duplication, unclear naming, and avoidable indirection without changing intended behavior.
3. **Clean:** Check for and remove clearly safe, in-scope dead or unnecessary code, dependencies, branches, tests, and artifacts. Do not remove code based only on an assumption that it is unused.
4. **Verify:** Run `verification-before-completion` on the post-cleanup state, including relevant automated tests and required real-user or manual validation.

The orchestrator records review findings, cleanup performed or deemed unnecessary, dead-code findings, verification commands and results, QA outcomes, limitations, and unresolved risks. If any stage fails, is skipped, unavailable, or unreported, do not claim completion; route required fixes through the implementation and existing QA loop, then repeat the gate. Documentation-only, explanation-only, and investigation-only tasks use task-appropriate validation but do not require this code-quality gate.

## Clarity Gate: When to Run `interview-me`

After invoking both meta-skills, perform a clarity check before classifying the task. Run `interview-me` first if any of the following are true:

- The request is missing **who**, **why**, what **success** looks like, or the binding **constraint**
- The instruction uses a generic convention without specifics ("build me X", "make it faster", "clean it up")
- You catch yourself filling in unstated assumptions before selecting skills or making a plan
- The user has not said which value they are optimizing when two reasonable ones are in tension
- The user explicitly asks to be interviewed, grilled, or stress-tested

If the instruction is self-contained and unambiguous ("rename this variable", "fix this typo", "run this specific command"), skip `interview-me` and proceed with classification.

## Reconciliation Rules

1. **Always run both meta-skills first.** Never select skills from only one source. The discipline gate (using-superpowers) and the lifecycle router (using-agent-skills) cover different blind spots.

2. **Clarity before classification.** The clarity gate is not optional. If the task is vague, run `interview-me` before the Task → Combined Skill Patterns table, using the clarified intent as the input for classification.

3. **Union, then prune.** Collect every skill either source surfaces, then remove any that does not earn its place for the current task. Smallest effective set wins — applying ten skills to a one-line fix is a failure, not thoroughness.

4. **De-duplicate by intent, not by name.** Some skills exist in both catalogs. Pick one instance and apply it once.

5. **Order by phase:** process/understanding skills first (brainstorming, debugging, spec, planning), then implementation, task-specific validation, the final quality gate for code changes, and then ship. A task is not done until the required final verification passes.

6. **Honor the 1% rule from using-superpowers.** If there is even a 1% chance a skill applies, include it in the candidate list before pruning.

7. **User instructions outrank everything.** If the user (or CLAUDE.md / AGENTS.md) says skip a workflow, skip it. This bridge never overrides explicit user intent.

8. **Prefer the more specific skill on conflict.** A domain skill (e.g. frontend-ui-engineering) beats a generic one when both cover the same step.

9. **Always consult `ui-ux-pro-max` first on design work.** If the task involves *any* visual design, UI, or UX decision — pages, components, layout, color, typography, spacing, iconography, motion, accessibility, or data visualization — invoke `ui-ux-pro-max` before any other frontend skill. It is a searchable local database (84 styles, 192 palettes, 74 font pairings, 192 product types, 98 UX guidelines, 104 icons, 16 motion presets, 25 chart types across 22 stacks) that supplies the concrete design decisions the other skills then apply. It grounds the work in real reference data instead of invented defaults, so it is a research step, not an implementation step — it never replaces `frontend-ui-engineering` for building.

   Applies to: new UI, redesigns, design reviews, "make this look better", picking a palette or font pairing, choosing a chart type, component styling, design tokens/systems.

   Skip it only when the task touches no design decision at all (pure logic, config, backend, copy-only edits, or a mechanical change to existing markup).

10. **Route visual frontend work through `design-taste-frontend`.** For any UI/UX task whose output must *look* intentional — landing pages, portfolios, marketing sites, or redesigns — include `design-taste-frontend` as the anti-slop gate that runs after `ui-ux-pro-max` supplies the reference data and before `frontend-ui-engineering` builds it. It sets design direction and enforces a pre-flight check against templated "AI-slop" output. Do NOT apply it to dashboards, data tables, admin panels, or multi-step product UI — it explicitly excludes those; use `ui-ux-pro-max` + `frontend-design` + `frontend-ui-engineering` alone there.

## Task → Combined Skill Patterns

| Task type | Efficient combination (after pruning) |
|-----------|----------------------------------------|
| New feature | brainstorming → spec-driven-development → planning-and-task-breakdown → incremental-implementation → test-driven-development → code-review-and-quality |
| Bug fix | systematic-debugging / debugging-and-error-recovery → test-driven-development → code-review-and-quality |
| Refactor | code-simplification → test-driven-development → code-review-and-quality |
| Vague idea | interview-me → idea-refine → spec-driven-development |
| Security-sensitive | security-and-hardening → doubt-driven-development → code-review-and-quality |
| Frontend / UI / UX design (landing pages, portfolios, marketing sites, redesigns) | brainstorming → **ui-ux-pro-max** (design data) → frontend-design → **design-taste-frontend** (anti-slop pre-flight gate) → frontend-ui-engineering → browser-testing-with-devtools |
| Product UI (dashboards, tables, admin, app screens) | brainstorming → **ui-ux-pro-max** (design data) → frontend-design → frontend-ui-engineering → browser-testing-with-devtools |
| Styling / visual polish only (palette, typography, spacing, motion, icons) | **ui-ux-pro-max** → frontend-ui-engineering |
| Data visualization (charts, dashboards, graphs) | **ui-ux-pro-max** (chart type + palette) → dataviz → frontend-ui-engineering |
| Design review / "make this look better" | **ui-ux-pro-max** (audit against guidelines) → design-taste-frontend → code-review-and-quality |
| Browser / UI QA | comprehensive-qa-testing or browser-testing-with-devtools |
| Ship / release | git-workflow-and-versioning → verification-before-completion → shipping-and-launch |

These are starting points. Always prune task-specific skills to what the specific task needs, but never prune the final quality gate for an in-scope code change. The clarity gate is applied before classification, so any task that is vague first runs `interview-me`, and the resulting clarified intent is used to classify the task and select the remaining skills.

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
- **Skipping the final quality gate.** Every code-changing plan must end with review, simplification, dead/unnecessary-code checks, and post-cleanup verification before claiming completion.
- **Skipping verification.** Every combined plan must end with a task-appropriate verification skill before claiming completion.
- **Designing without querying `ui-ux-pro-max`.** Picking colors, fonts, spacing, or chart types from memory produces generic output. Query the database first, then build.
- **Treating `ui-ux-pro-max` as the builder.** It supplies design decisions; `frontend-ui-engineering` still writes the code.
- **Skipping the clarity gate.** If the instruction is vague and you proceed directly to classification or implementation, you will build against unstated assumptions. Run `interview-me` first when the criteria in the Clarity Gate section are met.
