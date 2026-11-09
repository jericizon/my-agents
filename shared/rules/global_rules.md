---
description: Global engineering and safety rules for all repositories
---

# AI ENGINEERING SYSTEM

## CORE PRINCIPLES

1. Understand before acting.
2. Clarify when requirements, scope, or success criteria are unclear.
3. Prefer the smallest safe change.
4. Reuse existing patterns before creating new ones.
5. Avoid overengineering and speculative abstractions.
6. QA is mandatory.
7. Never claim success without validation.

---

## SCOPED CONTEXT RULES

- Never read every workflow file up front.
- Inspect only the relevant surrounding code before expanding context.
- Never scan the whole repository unless the current task requires it.
- Use target file reads and searches; do not use broad scans when a targeted inspection can answer the question.

---

## REQUEST CLASSIFICATION

Classify every task before starting:

* BUGFIX
* UPDATE
* NEW_FEATURE
* REFACTOR
* PERFORMANCE
* SECURITY
* TESTING
* DOCUMENTATION
* INVESTIGATION

If classification or requirements are unclear:

STOP and ask questions.

---

## SHARED WORKSPACE ARTIFACTS

Agent-generated files that are not project source (specs, plans, QA reports, reviews, retrospectives, `.superpowers/` checkpoints and state, `tasks/` scratch, brainstorm sessions, QA evidence) live in a shared workspace area, not inside the repository.

Resolution:

* `WORKSPACE_ROOT` = `~/Workspace` if it exists, else `~/workspace` if it exists, else `~/Workspace` (create on demand).
* `SHARED_ROOT` = `$WORKSPACE_ROOT/_shared` (created by `sync-agents.sh`; `mkdir -p` on first write).
* Project shared dir = `$SHARED_ROOT/` + the project path relative to `WORKSPACE_ROOT`. Example: `~/Workspace/my-agents` → `~/Workspace/_shared/my-agents`; `~/Workspace/clients/custom-app` → `~/Workspace/_shared/clients/custom-app`.
* Paths already under `_shared/` resolve to themselves.
* Projects outside `WORKSPACE_ROOT` keep using in-repo paths.

Rules:

* Any path a skill, workflow, or document specifies under `docs/superpowers/`, `.superpowers/`, `tasks/`, or equivalent generated scratch resolves under the project shared dir with the same subpath.
* When a script takes a project/output dir for artifact storage, pass the project shared dir.
* Create directories lazily with `mkdir -p`. Never commit `_shared` content into a repository.

---

## TASK CONTINUITY POLICY

Canonical policy: `~/.config/agent-workflow/TASK_CONTINUITY.md` (Universal AI Coding Agent Policy v2.0 — cross-harness continuity, quota recovery, sub-agent orchestration, TDD, QA). Read it for any non-trivial task; it defines the full checkpoint schema and recovery procedures.

* Maintain a durable checkpoint at `<project shared dir>/.superpowers/CURRENT_TASK.md` (see Shared Workspace Artifacts) for every non-trivial, multi-step task. Update it after meaningful milestones, before interruptions, and when blocked. Never store secrets in checkpoints.
* Use explicit statuses: `PLANNING`, `IN_PROGRESS`, `WAITING_FOR_QUOTA`, `BLOCKED`, `READY_TO_RESUME`, `QA_IN_PROGRESS`, `NEEDS_USER_INPUT`, `COMPLETED`. Mark `COMPLETED` only when acceptance criteria and verification pass.
* On usage limits, identify the actual cause (quota vs. billing vs. auth vs. rate limit), update the checkpoint, and record recovery state with `quota-recovery-controller.sh` (my-agents repo root). Never assume waiting fixes billing/auth/permission issues.
* Verify harness capabilities before relying on them; do not assume session-resume flags, hooks, or quota APIs from one harness exist in another. Never invent undocumented mechanisms.
* Sub-agents: define scope, file ownership, acceptance criteria, and checkpoint location before delegating; never run two workers on the same files; the main agent independently verifies integrated results before claiming completion.
* If the policy file is unavailable, do not pretend it was loaded; proceed with these rules and record the limitation.

---

## WORKFLOW

Before implementation:

1. Scan relevant code paths.
2. Confirm target code exists.
3. Review existing implementation.
4. Select relevant Agent Skills.
5. Follow Superpowers workflow.
6. Define acceptance criteria.
7. Implement.
8. Validate.
9. QA.
10. Report results.

---

## SUPERPOWERS DOCUMENTATION

Use Superpowers documentation structure when applicable.

Locations (under the project shared dir — see Shared Workspace Artifacts):

```text
docs/superpowers/specifications/
docs/superpowers/plans/
docs/superpowers/qa/
docs/superpowers/reviews/
docs/superpowers/retrospectives/
```

Required:

### New Features

* Specification
* Plan
* QA Report

### Major Enhancements

* Plan
* QA Report

### Significant Refactors

* Plan
* QA Report

### Small Bug Fixes

* QA Report only if documentation would add value.

Avoid creating unnecessary documentation.

---

## AGENT SKILL SELECTION

Automatically invoke the most relevant skill(s).

| Task Type              | Skill                                        |
| ---------------------- | -------------------------------------------- |
| Bug Fix                | systematic-debugging                          |
| New Feature            | brainstorming → writing-plans                 |
| Planning / Breakdown   | writing-plans                                  |
| Implementation         | executing-plans / subagent-driven-development |
| Refactor               | writing-plans → executing-plans               |
| UI/UX or Visual Design | ui-ux-pro-max; + using-my-designer for existing-UI redesigns |
| Testing                | test-driven-development                        |
| Code Review            | requesting-code-review                         |
| Live QA                | using-my-qa                                        |
| Validation             | verification-before-completion                 |
| Unclear Requirements   | brainstorming                                  |
| Final Validation       | verification-before-completion                 |
| Ship / Merge           | finishing-a-development-branch                 |

Use only the skills relevant to the task.

---

## IMPLEMENTATION RULES

Before changing code:

* Locate existing implementation.
* Review related files and tests.
* Follow existing conventions.
* Reuse existing utilities and modules.
* Minimize scope of change.
* Never create, edit, or overwrite `.env` files or local environment override files without explicit user confirmation.

Prefer extending existing code over introducing new abstractions.

Do not modify or invent code blindly.

---

## COMMENTS

Say what the code does and why, briefly. The problem belongs in the PR.

* Default to 1–2 lines. A comment growing into a paragraph is a smell.
* Don't write 4–6 line comment headers on functions/blocks unless asked.
* This applies to my own added comments — still match existing file conventions where a file already uses a heavier comment style.
* Don't narrate the incident, root-cause analysis, or alternatives considered in the code; that's PR-description material. Leave a terse pointer at most.
* Keep the non-obvious *why* (a surprising choice, a magic number); drop the backstory.

---

## TESTING STRATEGY

Use TDD when appropriate:

* Business logic
* APIs
* Services
* Financial calculations
* Critical workflows

For UI, configuration, documentation, styling, or infrastructure changes:

* Implement
* Validate
* Add regression coverage where practical

All changes require validation.

---

## QA REQUIREMENTS

QA is mandatory.

For QA and validation:

1. Follow the Superpowers QA workflow.
2. Use the most relevant testing/review skill available.
3. Generate realistic test scenarios.
4. Consider edge cases and regressions.
5. Validate business impact.
6. Verify acceptance criteria.

When applicable:

- Run unit tests
- Run integration tests
- Run E2E tests
- Perform manual validation
- Review logs and error handling

Document findings in `docs/superpowers/qa/` (under the project shared dir).

Before completion verify:

* Requirements satisfied
* No regressions introduced
* Existing patterns respected
* Validation completed

---

## SECURITY RULES

Treat these as HIGH RISK by default:

* Authentication
* Authorization
* Payments
* Wallets
* Admin Actions
* Webhooks
* Protected Data

Always enforce:

* Server-side authorization
* Ownership validation
* Input validation
* Explicit error handling
* Idempotency where required
* Rate limiting where applicable
* Audit logging for sensitive operations

Never expose:

* Secrets
* Tokens
* Credentials
* Internal stack traces
* Sensitive data

Flag vulnerable or unmaintained dependencies.

---

## PRODUCTION-GRADE ERROR HANDLING

Apply to all code created or modified by a task. Implement each safeguard where the risk warrants it, document what does not apply and why, and avoid unnecessary machinery. Ask only when unresolved ambiguity could materially affect security, data integrity, or behavior.

Failure handling:

* Identify validation, authorization, transient, permanent, dependency, data-consistency, and unexpected failures before coding.
* Validate inputs at the boundary and return clear, accurate, secure errors. Never expose stack traces, secrets, or internal paths.
* Never report success for incomplete work, silently ignore a failure, discard failed work, or continue unsafe processing.
* Auto-resolve routine errors only when safe: supported token refresh and recoverable connection failures.

External calls and retries:

* Set connection and operation timeouts on every external call.
* Retry only transient failures and operations that are safe to repeat.
* Bound retries: limited attempts, an overall deadline, exponential backoff with jitter, and server-provided Retry-After when present.
* Never retry permanent failures, invalid input, or authorization failures unless a supported credential refresh can fix them.

Data safety:

* Make repeatable operations idempotent (idempotency keys or deduplication) so payments, records, messages, and notifications are not duplicated.
* Prevent partial changes with transactions, rollbacks, compensating actions, or build-then-swap writes.
* Preserve failed work and enough context (inputs, error, attempt history) to investigate and resume safely.

Exception handling:

* Catch specific exceptions only where the code can recover, add context, clean up, or return an accurate response.
* Keep the original cause and stack trace when re-raising or wrapping.
* Clean up with finally, defer, trap, or context managers.
* Add an application-boundary handler for unexpected failures. It records the failure, then returns a safe response or terminates. Never swallow it and continue.

Queued work and jobs:

* Bound retries. Move repeatedly failing work to protected failure storage (dead-letter queue or equivalent).
* Keep the message, error details, attempt history, and correlation ID. Provide monitoring and a safe, idempotent replay path.

Logging and alerts:

* Log structured events: timestamp, operation, error category, safe context, attempts, final outcome, and correlation ID.
* Never log passwords, tokens, secrets, private data, or unnecessary sensitive values.
* Log routine failures that recover; do not notify anyone for them.
* Send one minimal, actionable, deduplicated alert only when recovery is exhausted or a failure threatens security, data, or an important process.
* If no alerting channel exists, document the exact configuration required.

Verification:

* Test what applies: invalid input, permanent and transient failures, timeouts, exhausted retries, backoff and rate limits, idempotency and duplicates, rollbacks and partial failures, expected and unexpected exceptions, queue retry and replay, secure logging, correlation IDs, and alert conditions.
* Run the relevant tests, linters, and type checks before claiming completion.

Completion report: failure scenarios identified, safeguards implemented, tests and validation run, assumptions made, and unresolved risks or required configuration.

---

## DOCUMENTATION

Update documentation when:

* Architecture changes
* Public APIs change
* Database schemas change
* Workflows change
* New features are added

Prefer updating existing documentation over creating duplicates.

---

## GIT SAFETY

Allowed:

* git status
* git diff
* git log
* git show
* git branch
* git commit
* git push

Forbidden:

* git commit to restricted branches (main, master, develop, staging, or other protected branches as configured)
* git push to restricted branches (main, master, develop, staging, or other protected branches as configured)
* git merge
* git rebase
* git reset
* git checkout
* git stash
* branch deletion
* force push

Never modify repository history.

Before committing or pushing:
* Verify the target branch is NOT a restricted/protected branch
* For restricted branches, instruct the user to perform the operation manually or use proper PR workflow

If a task requires forbidden Git operations, instruct the user to perform them manually.

## WORKSPACE & BRANCH POLICY

* Never use git worktrees for isolation. When a skill suggests creating a worktree (e.g. `using-git-worktrees`), skip that step and work directly on the current branch.
* Before implementation, check the current branch. If it is `main`, `master`, `develop`, `staging`, or another protected branch, suggest creating a feature branch first and wait for approval before proceeding. On any other branch, work on it as-is.

## COMMIT MESSAGE GUIDELINES

When providing commit message suggestions:

* Use Conventional Commits format: `type(scope): summary`
* Keep messages concise and focused on the "why" not the "what"
* Do not include "Generated with" or similar attribution lines
* Do not include "Co-Authored-By" or co-authorship attributions
* Do not add tool-specific branding or footers

Commit messages should be clean and free of AI tool attribution.

---

## DEV SERVER RESTRICTIONS

Do not start application servers or watch processes.

Assume the application is already running unless the user explicitly asks for startup instructions.

Do not run any command that launches the app, a dev server, a preview server, or a watch-mode process, even if the command name differs from the examples below.

Examples:

* pnpm run dev
* pnpm dev
* npm run dev
* npm start
* yarn run dev
* yarn dev
* docker compose up

User manages runtime processes.

If startup is required, provide instructions only.

---

## OUTPUT STYLE

Responses should be:

* Structured
* Concise
* Explicit
* Actionable

Do not include unnecessary verbosity.

---

## COMPLETION CHECKLIST

Before marking work complete:

* Requirements understood
* Relevant documentation updated
* Implementation completed
* Validation completed
* QA completed
* Acceptance criteria verified
* Error-handling requirements applied, or documented as not applicable
* No known blocking issues

Do not mark a task complete if validation or QA has not been performed.
