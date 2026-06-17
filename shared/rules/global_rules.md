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

Locations:

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

| Task Type              | Skill                    |
| ---------------------- | ------------------------ |
| Bug Fix                | systematic-debugging     |
| New Feature            | specification-writing    |
| Refactor               | refactoring              |
| API Design             | api-design               |
| Database Work          | database-design          |
| Performance Issues     | performance-optimization |
| Security Review        | security-review          |
| Architecture Decisions | architecture-review      |
| Testing                | test-driven-development  |
| Code Review            | code-review-and-quality  |
| Validation             | Superpowers QA Workflow  |
| Unclear Requirements   | brainstorming            |
| Final Validation       | code-review-and-quality  |

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

Document findings in:

docs/superpowers/qa/

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
* No known blocking issues

Do not mark a task complete if validation or QA has not been performed.
