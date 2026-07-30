# Using My Agents Orchestration Design

Enhance `custom/skills/using-my-agents-skill/SKILL.md` so it acts as a mandatory orchestration entry point for task-oriented conversations. The skill must create one orchestrator sub-agent, route decomposed work to implementation sub-agents, and assign one dedicated QA sub-agent per cohesive feature or workstream.

## Motivation

The current skill reconciles skill recommendations but does not define who owns sub-agent coordination, how dependent implementation tasks share context, or how QA is assigned across a multi-task feature. This can lead to fragmented delegation, duplicated QA agents, and completion decisions that lack realistic user-level validation.

## Goals

- Always create an orchestrator sub-agent when this skill is invoked for task-oriented work.
- Require the orchestrator to understand, clarify, classify, and decompose the request before delegation.
- Route each implementation sub-agent only the relevant subtask plus shared context.
- Use one dedicated QA sub-agent for each cohesive feature or workstream, not one per implementation task.
- Have QA invoke `real-user-qa` and independently choose realistic scenarios based on a complete QA context package.
- Require implementation-to-QA correction loops with a default maximum of three cycles.
- Keep the orchestrator as the single reporting boundary to the main agent and user.
- Route later task-related clarifications and follow-up messages through the existing orchestrator.
- Keep purely conversational responses out of the implementation and real-user-QA workflow.

## Non-Goals

- Creating a separate QA agent for every implementation task.
- Broadcasting the full original message to every sub-agent.
- Replacing the existing skill-discovery and skill-reconciliation behavior.
- Requiring real-user QA for explanations or other responses that do not change or evaluate behavior.
- Introducing a runtime framework, persistent agent registry, or new command-line tooling.

## Proposed Behavior

### Orchestration Gate

When invoked for a task, the skill first creates an orchestrator sub-agent. The orchestrator receives the original request and must establish the clarified intent, task classification, acceptance criteria, constraints, affected areas, dependencies, and selected skill sequence before dispatching implementation work.

If the request is ambiguous, the orchestrator performs the required clarification interview before delegating. It must not dispatch agents based on unresolved assumptions.

### Scoped Routing

The orchestrator decomposes the work into ordered or parallel subtasks. Each implementation sub-agent receives:

- its assigned subtask
- the relevant acceptance criteria
- shared feature context
- dependencies and prerequisite outputs
- applicable skills and constraints
- expected reporting format

The full original message is not blindly sent to unrelated sub-agents. Sub-agents report their work, evidence, blockers, and changed surfaces back to the orchestrator.

### Single QA Owner

For every behavior-changing feature, bug fix, or cohesive workstream, the orchestrator creates exactly one dedicated QA sub-agent at the beginning of the workstream. The QA sub-agent remains assigned across all dependent implementation tasks and owns validation for the integrated feature.

The QA sub-agent receives a QA context package containing:

- clarified user intent and feature scope
- acceptance criteria and out-of-scope behavior
- task breakdown and dependency graph
- affected files, components, APIs, or workflows
- implementation summaries or diffs as they become available
- expected real-user workflows
- known constraints, risks, and edge cases
- automated test, build, and type-check results
- environment and runtime prerequisites

The QA sub-agent invokes `real-user-qa`, validates relevant task checkpoints as prerequisites become available, and performs a final end-to-end pass after integration. Additional QA sub-agents are allowed only when the work is split into genuinely independent workstreams, a specialized validation domain requires separate expertise, or the user explicitly requests parallel QA.

### Correction Loop

When QA identifies a failure, the orchestrator sends the finding and evidence to the responsible implementation sub-agent, updates shared context, and reruns validation. The default maximum is three implementation-to-QA cycles per feature/workstream. After the third unsuccessful cycle, the orchestrator stops the loop and escalates the unresolved issue with the attempts, evidence, and remaining risk.

A successful completion requires both automated verification appropriate to the change and the dedicated QA sub-agent's real-user validation, unless the environment prevents runtime validation. If runtime validation is unavailable, the orchestrator must report that limitation rather than claim full QA completion.

### Follow-Up Messages

Task-related follow-ups, clarifications, corrections, and scope changes continue through the existing orchestrator. The orchestrator updates the shared context, determines which sub-agents need the new information, and preserves the same QA owner unless the work becomes a separate feature or workstream.

Pure acknowledgements, explanations, and unrelated conversational responses do not require implementation delegation or real-user QA.

### Reporting

The orchestrator is the only sub-agent that presents the consolidated status to the main agent or user. Its report includes:

- clarified intent and scope
- delegated tasks and dependency status
- files or behavior changed
- automated verification evidence
- real-user QA scenarios and outcomes
- retry count, if any
- unresolved issues, limitations, and risk
- final pass, blocked, or escalated status

## Acceptance Criteria

- Invoking the skill explicitly requires an orchestrator for task-oriented work.
- The orchestrator understands and decomposes a request before delegation.
- Sub-agents receive scoped subtasks instead of an indiscriminate full-message broadcast.
- A feature with four dependent implementation tasks creates one QA owner, not four QA agents.
- The QA owner is created at workstream start and receives complete cross-task context.
- QA invokes `real-user-qa` and validates both task checkpoints and the final integrated flow.
- QA failures trigger correction and re-validation, capped at three cycles.
- The third failed cycle escalates instead of looping indefinitely.
- Follow-up task messages are routed through the same orchestrator and QA owner.
- Conversational-only responses are exempt from implementation delegation and real-user QA.
- Final reporting is synthesized by the orchestrator and includes evidence rather than an unsupported success claim.

## Validation Plan

- Run pressure scenarios against the current skill to establish baseline delegation and QA behavior.
- Add the orchestration rules to the skill with explicit wording for one-QA-per-workstream ownership and retry limits.
- Re-run the same pressure scenarios with the enhanced skill.
- Verify the skill's frontmatter and content with repository skill tests or targeted static checks.
- Review the final diff for scope, ambiguity, duplicate rules, and unsupported claims.
