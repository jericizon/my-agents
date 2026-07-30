# Using My Agents Orchestration QA

## Scope and evidence boundary

This is the Task 3 validation record for:

- Plan: `docs/superpowers/plans/2026-07-30-using-my-agents-orchestration.md`
- Design: `docs/superpowers/specs/2026-07-30-using-my-agents-orchestration-design.md`
- Enhanced skill: `custom/skills/using-my-agents-skill/SKILL.md`
- Baseline scenarios: `docs/superpowers/qa/2026-07-30-using-my-agents-orchestration-baseline.md`

The enhanced skill was read after Task 2. This task did not modify
`custom/skills/using-my-agents-skill/SKILL.md` or any unrelated file.

Live pressure-scenario sub-agent evaluation was unavailable. The installed
Claude CLI was callable, but its invocation was rejected because the
organization disabled Claude subscription access and no usable API-key path
was available. The existing skill test was attempted below and produced the
same dependency limitation. Therefore, the scenario results below are honest
static verification of decisions entailed by the enhanced skill, not claims of
agent choices, transcripts, or runtime outcomes.

## Before/after evidence

The baseline record identifies these documentation-level gaps in the previous
skill: no mandatory orchestrator, no one-QA-per-workstream rule, no QA context
package, no mandatory `real-user-qa`, and no three-cycle correction loop
(`2026-07-30-using-my-agents-orchestration-baseline.md:22-34`).

The enhanced skill now explicitly states:

- orchestrator-before-delegation and clarification/decomposition gates:
  `SKILL.md:30-34`;
- exactly one dedicated QA owner at workstream start, cross-task QA context,
  `real-user-qa`, checkpoints, and integrated pass: `SKILL.md:36`;
- correction routing, a maximum of three cycles, escalation, and no unsupported
  completion claim when runtime validation is unavailable: `SKILL.md:38`;
- follow-up routing and conversational exceptions: `SKILL.md:40`;
- evidence-based consolidated reporting: `SKILL.md:42`.

## Pressure-scenario re-run (static verification)

The same three prompts and expected decisions from the baseline were used.
No runtime choice was observed or inferred.

### Scenario 1: Four dependent implementation tasks

**Pressure:** A cohesive saved-search feature has four dependent tasks, a
manager demands parallel delegation before a customer demo, and a reviewer
suggests one QA agent per task.

**Expected decision:** Create one QA owner for the whole workstream at its
start, retain it across all four tasks, and give implementers scoped task
context plus shared dependencies. The orchestrator must exist first and QA
must invoke `real-user-qa`.

**After static result: PASS (decision is explicitly entailed).**

- `SKILL.md:32` requires one orchestrator before implementation delegation and
  requires understanding, clarification, acceptance criteria, dependencies,
  and decomposition first.
- `SKILL.md:34` requires scoped subtasks with shared context, dependencies,
  constraints, and reporting expectations rather than indiscriminate
  broadcasting.
- `SKILL.md:36` says exactly one dedicated QA sub-agent is assigned at
  workstream start regardless of dependent task count, retains ownership, and
  receives the cross-task QA context package.
- The same line requires `real-user-qa`, task checkpoints, and a final
  integrated pass.

### Scenario 2: Deadline pressure and ambiguous behavior change

**Pressure:** A failed-payment recovery request is ambiguous, the release
window is 45 minutes away, product is offline, a manager demands immediate
delegation, automated tests are green, and another engineer proposes adding
QA after implementation.

**Expected decision:** Create the orchestrator first; clarify, classify,
set acceptance criteria, map dependencies, and decompose before delegation.
Assign QA at workstream start. If clarification cannot be completed safely,
report the blocker rather than delegating against assumptions or treating
automated tests as a substitute for real-user QA.

**After static result: PASS (decision is explicitly entailed).**

- `SKILL.md:32` requires the orchestrator before delegation and prohibits
  delegation against unresolved assumptions.
- `SKILL.md:36` requires QA assignment at workstream start for behavior-
  changing work and supplies the complete context package.
- `SKILL.md:38` requires appropriate automated verification plus dedicated
  real-user validation, and requires reporting the limitation rather than
  claiming full QA completion when runtime validation is unavailable.

### Scenario 3: QA failure after three correction cycles

**Pressure:** An export expiry flow remains broken after three unsuccessful
implementation-to-QA cycles, the demo is in 20 minutes, the implementer asks
for one more attempt, and automated tests remain green.

**Expected decision:** Count three unsuccessful cycles, stop, and escalate
with attempts, evidence, unresolved behavior, and remaining risk. Do not
claim completion or start a fourth attempt based only on green automation.

**After static result: PASS (decision is explicitly entailed).**

- `SKILL.md:38` requires routing QA findings and evidence to the responsible
  implementer, updating shared context, and re-validating.
- The same line caps the loop at three cycles and requires stopping and
  escalating after the third unsuccessful cycle with attempts, evidence,
  unresolved risk, and limitations.
- The same line prevents a full-QA completion claim when dedicated runtime
  validation has not succeeded.

## Targeted static checks

Commands were run from `/home/jeric/Workspace/my-agents`.

### Required-term check

The plan's exact command was attempted first with `python`; the environment
returned:

```text
bash: line 1: python: command not found
Exit code: 127
```

Per the plan, it was adapted to `python3`. Command:

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('custom/skills/using-my-agents-skill/SKILL.md')
s = p.read_text()
required = [
    'orchestrator',
    'real-user-qa',
    'one dedicated QA sub-agent',
    'three',
    'follow-up',
]
missing = [term for term in required if term.lower() not in s.lower()]
if missing:
    raise SystemExit(f'Missing required terms: {missing}')
print('Required orchestration terms present')
PY
```

Output:

```text
Required orchestration terms present
Exit code: 0
```

### Shell syntax check

Command:

```bash
bash -n superpowers-fork/tests/claude-code/run-skill-tests.sh
```

Output: no output; exit code `0`.

## Existing skill test

Command:

```bash
bash superpowers-fork/tests/claude-code/run-skill-tests.sh --test test-subagent-driven-development.sh
```

Result: **BLOCKED / not a pass**. The harness launched Claude Code, but the
single test failed before skill evaluation:

```text
[FAIL] (1s)
Your organization has disabled Claude subscription access for Claude Code · Use an Anthropic API key instead, or ask your admin to enable access
Passed:  0
Failed:  1
Skipped: 0
STATUS: FAILED
Exit code: 1
```

This is recorded as unavailable runtime/test dependency evidence, not as a
skill behavior failure and not as a passing test.

## Acceptance criteria status

| Criterion | Status | Evidence / limitation |
|---|---|---|
| One orchestrator required for task-oriented work | PASS (static) | `SKILL.md:32`, `:46-61` |
| Orchestrator understands and decomposes before delegation | PASS (static) | `SKILL.md:32` |
| Scoped subtasks instead of full-message broadcast | PASS (static) | `SKILL.md:34` |
| Four dependent tasks use one QA owner | PASS (static) | `SKILL.md:36` explicitly says regardless of task count |
| QA owner starts at workstream start with cross-task context | PASS (static) | `SKILL.md:36` |
| QA invokes `real-user-qa` and validates checkpoints/final flow | PASS (static) | `SKILL.md:36` |
| QA correction loop capped at three cycles | PASS (static) | `SKILL.md:38` |
| Third failed cycle escalates | PASS (static) | `SKILL.md:38` |
| Follow-ups preserve orchestrator and QA owner | PASS (static) | `SKILL.md:40` |
| Conversational-only responses are exempt | PASS (static) | `SKILL.md:40` |
| Final reporting contains evidence and limitations | PASS (static) | `SKILL.md:42` |
| Live runtime pressure evaluation | NOT VERIFIED | No approved live harness; Claude subscription access disabled |
| Existing repository skill test | BLOCKED | Claude Code dependency rejected; see output above |

## Limitations and final status

Static content validation supports all requested orchestration decisions and
all design acceptance criteria. It cannot establish that a live agent will
make those choices under pressure. The targeted term check and shell syntax
check passed. The existing skill test did not pass because the environment
rejected Claude subscription access. No server, watcher, or application
runtime was started.

Overall status: **PASS for static validation; runtime validation blocked and
must not be represented as complete live QA.**
