# Using My Agents Unconditional Orchestrator QA

## Scope

Validate the behavior change in `custom/skills/using-my-agents-skill/SKILL.md` requiring exactly one orchestrator for every task-oriented invocation, including simple, narrow, obvious, single-skill, follow-up, clarification, and delegated tasks.

## Static checks

- The description now states that the skill applies to every task-oriented invocation.
- The former exemptions for narrow subagent tasks and obviously single-skill tasks were removed.
- The `When to Use` section explicitly includes simple, narrow, single-skill, direct, delegated, and follow-up tasks.
- The contract requires spawning/designating exactly one orchestrator before discovery, implementation, or any other delegation, regardless of size, complexity, type, or simplicity.
- Only genuinely non-task turns remain exempt: pure acknowledgements, standalone explanations, and unrelated conversation.
- Task-related follow-ups continue through the same orchestrator.
- The custom source and generated runtime copy match.
- Markdown/frontmatter and diff checks passed.

## Validation commands

```text
python3 targeted orchestration checks: PASS
cmp custom/skills/.../SKILL.md superpowers-agents/skills/.../SKILL.md: PASS
bash -n superpowers-fork/tests/claude-code/run-skill-tests.sh: PASS
git diff --check: PASS
```

The targeted repository skill test was attempted:

```text
bash superpowers-fork/tests/claude-code/run-skill-tests.sh --test test-subagent-driven-development.sh
```

It was blocked before skill evaluation because the Claude Code OAuth session was expired and could not be refreshed. Result: `0` passed, `1` failed. This is an environment/authentication limitation, not evidence of a skill behavior failure.

## QA outcome

**Static QA: PASS.** The final diff is focused and closes the simple-task, single-skill, narrow-subagent, discovery, and follow-up orchestration loopholes.

**Runtime pressure QA: NOT VERIFIED.** Live agent behavior could not be evaluated because the available Claude Code test harness could not authenticate. No claim of runtime compliance is made.
