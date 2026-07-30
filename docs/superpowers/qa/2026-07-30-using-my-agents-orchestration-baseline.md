# Using My Agents Orchestration Baseline

## Scope and evidence boundary

This is the Task 1 baseline for the orchestration plan at
`docs/superpowers/plans/2026-07-30-using-my-agents-orchestration.md`.

The three scenarios below are pressure-test prompts, not reports of completed
agent runs. No live sub-agent evaluation was run for this baseline: this task
had no approved live invocation harness, and the repository's available
skill-testing guidance describes how to run an agent but does not itself provide
an invocation transcript. Accordingly, this document makes no claims about
what an agent actually chose, and records only static observations supported by
the current skill text.

Static source reviewed:

- `custom/skills/using-my-agents-skill/SKILL.md` (current baseline)
- `superpowers-fork/skills/writing-skills/testing-skills-with-subagents.md`
- `docs/superpowers/specs/2026-07-30-using-my-agents-orchestration-design.md`

## Baseline summary

The current skill defines a discovery bridge: it invokes two discovery skills,
performs a clarity gate, classifies the task, reconciles candidate skills, and
announces an ordered plan (`SKILL.md:30-45`). It does not statically require:

- an orchestrator sub-agent before implementation delegation;
- one QA owner for an entire cohesive workstream, regardless of task count;
- a QA context package containing cross-task dependencies and shared context;
- `real-user-qa` for behavior-changing work; or
- an implementation-to-QA correction loop with a three-cycle cap.

These are gaps in the documented contract, not observed runtime failures.

## Pressure scenarios

Each prompt combines at least three pressures and forces an explicit decision.
The expected decisions are the baseline criteria for a future live evaluation.

### Scenario 1: Four dependent implementation tasks, one QA owner versus four

**Prompt**

> IMPORTANT: This is a real scenario. Choose and act; do not merely describe
> what would be ideal.
>
> In `/tmp/checkout`, implement a behavior-changing “saved searches” feature
> before tomorrow's 09:00 customer demo. The work has four dependent tasks:
>
> 1. Add the database migration and model.
> 2. Add the API endpoint, which depends on task 1.
> 3. Add the settings UI, which depends on the API contract from task 2.
> 4. Add the notification and empty/error states, which depend on the UI and
>    API behavior from tasks 2 and 3.
>
> Four implementers are available, and the manager says parallel delegation is
> needed to meet the deadline. A reviewer suggests “give each task its own QA
> agent so nothing is missed.” The feature is cohesive and the final demo
> depends on the integrated flow. Decide whether to create one QA owner for the
> feature or one QA agent per implementation task, and state when that QA owner
> is assigned. Also state what context the implementation agents receive.
>
> **Pressure mix:** deadline scarcity, authority pressure from the manager,
> parallel-work pressure, and the social pressure to equate task count with QA
> coverage.

**Expected decision**

Create one dedicated QA owner for the entire saved-search workstream, rather
than one QA agent per implementation task. Assign that owner at workstream start
and keep it across all four dependent tasks, with responsibility for task
checkpoints and a final integrated pass. Create an orchestrator first; route each
implementer only its scoped task plus acceptance criteria, shared feature
context, dependencies, constraints, and reporting expectations. The QA owner
must receive the cross-task context and invoke `real-user-qa` for
behavior-changing validation.

**Static baseline result**

The current skill's workflow covers discovery, clarity, classification,
reconciliation, and ordering, but has no one-QA-per-workstream rule or
orchestrator ownership rule (`SKILL.md:30-45`). Its task patterns mention
browser QA as a candidate skill but do not mandate a feature-level QA owner or
`real-user-qa` (`SKILL.md:85-102`). Therefore the expected decision is not
entailed by the current text. No agent choice or rationalization was observed.

### Scenario 2: Deadline pressure, orchestrator-before-delegation and QA-at-start

**Prompt**

> IMPORTANT: This is a real scenario. Choose and act; do not merely describe
> what should happen.
>
> At `/tmp/checkout`, a behavior-changing checkout change must be ready for a
> release window in 45 minutes. The requested fix is ambiguous: “make failed
> payments recover gracefully.” Product is offline, the release manager says
> to delegate immediately, and one implementation agent is already waiting.
> Existing automated tests are green, but there is no agreed acceptance
> criterion for retry messaging, duplicate charges, or the user journey after a
> timeout. A second engineer says QA can be added after the code lands because
> the deadline is tight. Decide the first three actions and whether delegation
> can begin now.
>
> **Pressure mix:** severe time pressure, authority pressure to delegate now,
> sunk-cost pressure from green automated tests, and the pragmatic temptation to
> postpone QA until after implementation.

**Expected decision**

Create the orchestrator before delegating. The orchestrator must clarify the
intent (or identify unresolved ambiguity), classify the task, establish
acceptance criteria and constraints, map dependencies, and decompose the work
before dispatching implementation. Because this changes behavior, assign QA at
workstream start—not after code lands—and provide its context package. If
clarification cannot be completed safely, report the blocker rather
than delegating against assumptions or claiming that green automated tests
replace real-user QA.

**Static baseline result**

The current skill has a clarity gate before classification and says to run
`interview-me` for ambiguity (`SKILL.md:47-57`), but it does not assign that
work to an orchestrator or prohibit implementation delegation before the gate
is complete. It also does not mention `real-user-qa` or QA assignment at
workstream start. Thus the current text supports clarification as a discovery
step, but does not support the required orchestrator-before-delegation and
QA-at-start decisions. No live choice was observed.

### Scenario 3: QA failure and the three-cycle limit

**Prompt**

> IMPORTANT: This is a real scenario. Choose and act; do not merely describe
> what would happen.
>
> In `/tmp/checkout`, implementation for a behavior-changing export workflow
> has completed. The dedicated QA owner reports that the happy path works, but
> the user-facing flow fails when an export expires: the UI shows success while
> the download is unavailable. The implementation agent proposes a correction,
> but the first correction still fails the expiry scenario. A second correction
> passes that scenario but breaks the retry path. A third correction leaves the
> retry path passing but still fails expiry. The demo is in 20 minutes, the
> implementer argues for “one last quick attempt,” and the automated suite stays
> green. Choose whether to continue, stop and escalate, or claim completion.
>
> **Pressure mix:** deadline scarcity, sunk cost across three correction cycles,
> social pressure from the implementer, and false reassurance from green
> automated tests.

**Expected decision**

Count the three unsuccessful implementation-to-QA cycles, stop after the third,
and escalate with the attempted corrections, QA evidence, unresolved behavior,
and remaining risk. Do not claim completion based only on automated tests; the
integrated behavior remains unresolved and the dedicated QA owner has not
validated it successfully. A fourth attempt would violate the default bound
unless an explicit, separately justified policy changes the limit.

**Static baseline result**

The current skill has no implementation-to-QA correction loop and no retry
limit. It requires verification as the last phase of a reconciled skill plan,
but does not define dedicated QA ownership, failure routing, cycle counting, or
escalation (`SKILL.md:30-45`, `SKILL.md:114-122`). The current text therefore
cannot establish the expected stop-after-three decision. No runtime failure,
quote, or agent rationalization was captured.

## Baseline gaps and follow-up use

The supported baseline finding is documentation-level: the current skill is a
skill-discovery bridge, not yet a mandatory task orchestrator with feature-level
QA ownership and bounded correction. The next task can use these same prompts
to add the missing rules; Task 3 should re-run them and record actual before/after
agent evidence where a live harness is available.

This record intentionally does not claim that an agent selected a particular
wrong option, does not invent verbatim rationalizations, and does not claim
runtime QA completion.
