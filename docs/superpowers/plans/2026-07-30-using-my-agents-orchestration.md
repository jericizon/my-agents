# Using My Agents Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `using-my-agents-skill` a mandatory task orchestrator with one context-rich `real-user-qa` owner per cohesive feature or workstream.

**Architecture:** Keep the existing skill-discovery bridge and add an orchestration layer around it. The orchestrator owns clarification, decomposition, scoped routing, shared context, reporting, and the bounded implementation-to-QA loop. A single QA sub-agent is assigned to each cohesive workstream and validates dependent tasks as a unit.

**Tech Stack:** Markdown Agent Skill (`SKILL.md`), repository shell skill-test harness, pressure-scenario evaluation with sub-agents.

## Global Constraints

- Use one dedicated QA sub-agent per cohesive feature or workstream, not one per implementation task.
- Route scoped subtasks rather than broadcasting the full original message to unrelated sub-agents.
- Invoke `real-user-qa` for behavior-changing work.
- Use a default maximum of three implementation-to-QA retry cycles.
- Keep purely conversational responses outside the implementation and real-user-QA workflow.
- Do not start application servers or watch processes.
- Do not modify `.env` or local environment override files.
- Keep the change focused on `custom/skills/using-my-agents-skill/SKILL.md` plus required superpowers design/QA documentation.

---

### Task 1: Establish baseline pressure scenarios

**Files:**
- Create: `docs/superpowers/qa/2026-07-30-using-my-agents-orchestration-baseline.md`
- Read: `custom/skills/using-my-agents-skill/SKILL.md`
- Read: `superpowers-fork/skills/writing-skills/testing-skills-with-subagents.md`

**Interfaces:**
- Consumes: the current skill text and the approved design.
- Produces: three pressure scenarios and baseline observations that identify current orchestration and QA gaps.

- [ ] **Step 1: Define the pressure scenarios**

Create scenarios that force explicit choices:

1. A feature split into four dependent implementation tasks, testing whether the agent creates one QA owner or one QA agent per task.
2. A behavior-changing task under deadline pressure, testing whether the agent creates an orchestrator before delegating and assigns QA at workstream start.
3. A QA failure after implementation, testing whether the agent retries correction and stops after three cycles rather than looping indefinitely.

Each scenario must include concrete task context, at least three pressures, and an observable expected decision.

- [ ] **Step 2: Run or document the baseline evaluation**

Run the scenarios against the current skill when the available harness supports the invocation. If live sub-agent execution is unavailable, document that limitation and record the static baseline: the current skill has no mandatory orchestrator, no one-QA-per-workstream rule, no QA context package, and no retry loop.

- [ ] **Step 3: Capture exact failure modes**

Record observed or statically verified rationalizations, such as treating each implementation task as a separate QA scope, delegating before clarification, or declaring completion after automated tests without real-user QA.

- [ ] **Step 4: Verify the QA record**

Read the completed QA record and confirm it contains three scenarios, expected decisions, actual/static baseline results, and no invented runtime evidence.

---

### Task 2: Update the orchestration skill

**Files:**
- Modify: `custom/skills/using-my-agents-skill/SKILL.md`

**Interfaces:**
- Consumes: the approved design and baseline findings from Task 1.
- Produces: a concise, discoverable skill that preserves existing reconciliation behavior while adding mandatory orchestration rules.

- [ ] **Step 1: Add the trigger contract**

Update frontmatter description so it signals use at the start of task-oriented work and mentions orchestration, scoped delegation, and feature-level QA without summarizing the entire workflow.

- [ ] **Step 2: Add the orchestration gate**

Document that invocation for task-oriented work always creates one orchestrator sub-agent. Require understanding, clarification, classification, acceptance criteria, dependency mapping, and decomposition before implementation delegation.

- [ ] **Step 3: Add scoped routing and reporting**

Document the context passed to implementation sub-agents, prohibit indiscriminate full-message broadcasting to unrelated agents, and require all sub-agents to report to the orchestrator. Preserve the existing skill-discovery and reconciliation sections.

- [ ] **Step 4: Add single-QA ownership**

Document that one dedicated QA sub-agent is created at the beginning of each cohesive feature/workstream, regardless of the number of dependent implementation tasks. Require a QA context package and `real-user-qa` invocation, with task checkpoints and a final integrated pass.

- [ ] **Step 5: Add the bounded correction loop**

Document implementation-to-QA correction and re-validation with a default maximum of three cycles. Require escalation with evidence after the third unsuccessful cycle.

- [ ] **Step 6: Add follow-up and conversational exceptions**

Route task-related follow-ups through the existing orchestrator and preserve the QA owner. Explicitly exempt pure explanations, acknowledgements, and unrelated conversation from implementation delegation and real-user QA.

- [ ] **Step 7: Add final reporting requirements**

Require the orchestrator’s final report to include scope, delegated work, automated evidence, real-user QA scenarios and outcomes, retry count, limitations, risks, and status.

- [ ] **Step 8: Read the complete skill for consistency**

Check that the new rules do not contradict the existing `Do NOT use when`, reconciliation rules, task patterns, or announce format. Remove duplicate wording rather than adding competing rules.

---

### Task 3: Validate behavior and content

**Files:**
- Modify: `docs/superpowers/qa/2026-07-30-using-my-agents-orchestration-qa.md`
- Read: `custom/skills/using-my-agents-skill/SKILL.md`

**Interfaces:**
- Consumes: the enhanced skill and baseline scenarios.
- Produces: a QA report with before/after evidence, static checks, and remaining limitations.

- [ ] **Step 1: Re-run the three pressure scenarios**

Use the same scenarios from Task 1 with the enhanced skill. Verify the agent explicitly chooses one QA owner for four dependent tasks, creates the orchestrator before delegation, provides the QA context package, and enforces the three-cycle limit.

- [ ] **Step 2: Run targeted static checks**

Run:

```bash
python - <<'PY'
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
bash -n superpowers-fork/tests/claude-code/run-skill-tests.sh
```

Expected: the Python check prints `Required orchestration terms present`; shell syntax validation exits successfully.

- [ ] **Step 3: Run repository skill tests where applicable**

Run:

```bash
bash superpowers-fork/tests/claude-code/run-skill-tests.sh --test test-subagent-driven-development.sh
```

Expected: the applicable existing test passes, or the report records an unavailable CLI/test dependency without claiming a pass.

- [ ] **Step 4: Write the QA report**

Record pressure-scenario outcomes, commands and outputs, static validation, any unavailable runtime validation, and whether each acceptance criterion is satisfied.

- [ ] **Step 5: Review the final diff**

Run:

```bash
git diff --check
git diff -- custom/skills/using-my-agents-skill/SKILL.md docs/superpowers/specs/2026-07-30-using-my-agents-orchestration-design.md docs/superpowers/plans/2026-07-30-using-my-agents-orchestration.md docs/superpowers/qa/
```

Expected: no whitespace errors and only the requested skill plus its design, plan, and QA artifacts are changed.

---

## Completion Criteria

- The enhanced skill follows the approved one-orchestrator/one-QA-owner-per-workstream design.
- The four-dependent-task example is unambiguous: one QA sub-agent owns the entire feature.
- The QA sub-agent receives enough cross-task context to choose meaningful real-user scenarios.
- QA correction loops stop after three unsuccessful cycles.
- Pressure scenarios and targeted validation provide evidence for the behavioral rules.
- No completion claim is made without reporting the actual validation results and limitations.
