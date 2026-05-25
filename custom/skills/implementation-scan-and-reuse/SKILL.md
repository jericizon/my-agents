---
name: implementation-scan-and-reuse
description: Use when creating or modifying implementation code. Scan the relevant codebase first, confirm the target code exists, reuse existing patterns, and keep the change simple and reusable.
---

# Implementation Scan And Reuse

Only use this skill when creating or modifying code.

## Goal

Avoid blind edits, duplicate logic, and unnecessary abstraction.

## Workflow

1. Scan the relevant files first.
2. Confirm the target code, route, module, or test already exists where expected.
3. Find the closest existing pattern in the codebase.
4. Reuse an existing pattern before creating a new abstraction.
5. Implement the smallest reusable change that solves the request.

## Rules

- Do not start coding from assumptions.
- Do not introduce new helpers, wrappers, or abstractions unless repetition or clear reuse already exists.
- Prefer extending an existing function, component, or module over creating a parallel version.
- Keep interfaces narrow and names generic enough for real reuse, not speculative future use.
- If the simplest working change is local, keep it local.

## Completion Check

Before finishing, confirm:

- The code was based on real files, not guessed structure.
- The change follows an existing local pattern where possible.
- The implementation is simpler than the more abstract alternative.
