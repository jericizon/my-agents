---
name: real-user-qa
description: Use when unit or integration tests pass but the running app still breaks for real users, when you need to validate data browsing, filters, and create/update forms against a live backend, when checking that field input formats (dates, currency, phone, email, decimals, enums) don't trigger API/validation errors, or when a data-format mismatch between frontend and backend needs finding, fixing, and locking in with a regression test.
---

# Real User QA

## Overview

Unit tests pass because they feed the code the values the code expects. Real users don't. They type `07/22/2026` where the API wants `2026-07-22`, paste `$1,234.50` into a number field, leave optional fields blank, select the enum the UI offers but the backend rejects, and filter by a value that returns nothing.

**Real User QA drives the live app with realistic data to surface the format and contract mismatches unit tests structurally cannot see — then it turns each real defect into a regression test so the same gap can't reopen.**

The through-line: **browse → filter → fill every field with real-world data → submit → read the backend's actual response → diagnose the real cause → fix the smallest thing → re-run → lock it in with a test.**

## When to Use

Use when:
- unit/integration tests are green but the running app throws errors, saves wrong data, or shows API validation failures
- you need to validate data **browsing** (lists, tables, pagination) and **filters** against real data
- you need to exercise **create** and **update** forms and check *every* input field, not just the happy-path ones
- you suspect a **data-format mismatch** between what the UI sends and what the API accepts (dates, currency, decimals, phone, email, enums, nullability, string length)
- you want a real defect **found, fixed, and fool-proofed** with an added/updated test

Do not use when:
- the request is only to write or run unit tests with mocked data (that's regular TDD)
- the app is not running and the user only wants startup help
- you only need a client demo video (use [comprehensive-qa-testing] for recording)

## Relationship to comprehensive-qa-testing

[comprehensive-qa-testing] is the **orchestration + browser-driving + artifact/video** engine (MCP-first, tester/fixer lanes, screenshots, demo recording). Real User QA is the **data-and-contract discipline** that rides on top of it.

- Need to *drive a live browser, capture artifacts, or record a demo*? Use **comprehensive-qa-testing** for the mechanics (MCP/Playwright setup, screenshots, video, isolated install).
- Need to *decide what data to type, catch format/contract failures, diagnose them, and lock them in*? Use **this** skill.

Use both together: comprehensive-qa-testing moves the mouse; real-user-qa decides what to type and what "broken" means.

## Core Rules

- Assume the app is already running. Never start a dev/preview/watch server — provide startup instructions only if needed.
- **Read the field before you fill it.** Type, `name`, `maxlength`, `pattern`, `required`, `min`/`max`/`step`, `<option>` values, placeholder, and any inline mask tell you what the backend likely expects. Fill from that, not from a generic string.
- **Use real-world data, not `test`/`asdf`.** See the Realistic Data Playbook below.
- **Read the backend's actual answer, not just the UI.** Check the network response status and body (or server logs) for every submit. A green toast can hide a silently coerced value.
- When something breaks, **diagnose the real cause before touching code** — invoke [systematic-debugging]. Do not guess-patch.
- Fix the **smallest safe thing** that removes the defect and preserves the flow. Frontend format bug → fix the frontend; genuine backend contract gap → fix the backend; ambiguous contract → surface it, don't silently pick a side.
- **Every real defect ends as a test.** Add or update a unit/integration test that reproduces the exact failing input so the gap can't reopen. This is not optional — it's the point of the skill.

## Workflow

1. **Scan the repo first.** Find the route/page, the form component, the API endpoint + request schema/validator (Zod, DTO, serializer, DB constraints), and existing tests for this feature. The schema is your source of truth for what "correct format" means.
2. **Confirm the objective in user terms** — e.g. "a user can create an invoice with a due date and amount and it persists correctly."
3. **Browse the data.** Load the list/table. Verify rows render, pagination works, empty states behave, and no console/network errors fire on load.
4. **Exercise every filter.** For each filter: a matching value (returns expected subset), a non-matching value (clean empty state, not a crash), a boundary/edge value (date range endpoints, special characters), and clearing/resetting. Confirm the query the frontend sends matches what the backend expects.
5. **Enumerate every field** in the create form — including optional, hidden-until-toggled, and repeated/array fields. Miss no field.
6. **Fill each field with realistic data** matched to its type (Realistic Data Playbook). Deliberately include the formats real users produce that differ from the wire format.
7. **Submit and read the real response.** Capture the request payload and the response status + body. Success = correct HTTP status AND the persisted record matches what you entered AND no silent coercion.
8. **Repeat for update.** Load an existing record, confirm fields are pre-populated in the format the UI expects, change several fields, save, and re-verify persistence. Partial-update (PATCH) semantics are a common breakage point — check untouched fields aren't wiped.
9. **Run the edge matrix** (below) on the highest-risk fields.
10. **On any break, diagnose then fix.** Use [systematic-debugging] to find the real cause from the actual error, apply the smallest safe fix, then re-run step 7/8 for that case and re-run the full objective.
11. **Fool-proof it.** For each defect fixed, add/update a test that feeds the exact failing input and asserts the corrected behavior. Reuse the repo's existing test patterns and fixtures. Explain in one line why the existing tests missed it.
12. **Report:** what was exercised, what broke, the real cause, the fix, and the test that now guards it.

## Realistic Data Playbook

Feed values a real user would actually enter — including the messy-but-legitimate ones. Match the field's declared type first, then probe the format gap.

| Field type | Realistic value(s) | The format trap to probe |
|---|---|---|
| Date | `2026-07-22`, plus a user-typed `07/22/2026` / `22-07-2026` | UI display format vs. API `YYYY-MM-DD` / ISO-8601 / epoch; timezone shifting the day |
| Datetime | `2026-07-22T14:30:00Z` | Local vs UTC; missing timezone; seconds precision |
| Currency / money | `1234.50`, and user-typed `$1,234.50`, `1.234,50` | Thousands separators, symbol, decimal comma, integer-cents vs float |
| Decimal / float | `19.99`, `0.1`, `-5` | Rounding, `step` mismatch, precision/scale DB constraint |
| Integer | `0`, `42`, large `2147483648` | int overflow, leading zeros, string-vs-number |
| Phone | `+1 (555) 123-4567`, `5551234567` | E.164 normalization, spaces/parens rejected by regex |
| Email | `user.name+tag@example.co.uk` | Plus-addressing, subdomains, case, trailing space |
| Name / free text | `O'Brien`, `José`, `名前`, `李` | Apostrophes, accents, Unicode, emoji, quotes |
| Enum / select | every real `<option>` value, especially non-first | UI label vs backend value; casing; a value the API doesn't accept |
| Boolean / checkbox | true, false, indeterminate | `"on"` vs `true` vs `1`; unchecked = absent vs false |
| URL | `https://example.com/path?q=1` | Missing scheme, trailing slash |
| Optional field | left blank | empty string `""` vs `null` vs omitted — backend often distinguishes |
| Long text | a realistic paragraph near `maxlength` | length limit off-by-one, truncation, encoding |
| File upload | a real small file of the allowed type | MIME mismatch, size limit, wrong field name |

## Edge Matrix (run on high-risk fields)

- **Empty / whitespace-only** in a required field → clear, blocking validation (not a 500).
- **Boundary** values → `min-1`, `min`, `max`, `max+1`; first and last of a date range.
- **Wrong-format-but-plausible** → the display format instead of the wire format (the #1 real-user failure).
- **Special characters** → `'`, `"`, `<`, `&`, `;`, unicode, emoji — no crash, no injection, correct round-trip.
- **Null vs empty vs absent** → confirm the backend treats each the way the UI intends.
- **Cross-field rules** → end date before start date, total ≠ sum of lines, dependent-field combinations.
- **Idempotency / double-submit** → clicking save twice doesn't duplicate or corrupt.

## Diagnosing a Break (don't guess-patch)

When a submit fails or persists wrong data, **invoke [systematic-debugging]** and work from evidence:

1. Read the **actual** error — response body, validation message, stack trace, server log. Not the generic toast.
2. Compare the **sent payload** to the **backend schema** (the one you found in step 1 of the workflow). The mismatch is usually right there: format, type, casing, null-handling, or an extra/missing field.
3. Locate the boundary where it diverges: input mask → form state → serialization → request → API validator → DB constraint.
4. Decide ownership honestly:
   - Frontend sends the wrong format / coerces badly → **fix the frontend**.
   - Backend contract is genuinely too strict or wrong → **fix the backend** (flag it as a contract change).
   - Contract is ambiguous / undocumented → **surface it to the user**; don't silently pick a side.
5. Apply the **smallest** fix that preserves the flow. No opportunistic refactors.
6. Re-run the exact failing case, then re-run the full objective.

## Fool-Proofing: Update the Tests

This is the payoff. A defect the live run caught is a defect the unit tests *missed* — so the tests were feeding unrealistic data.

- Add or update a test that uses the **exact failing input** and asserts the **corrected** behavior.
- Put it beside the existing tests for the feature; reuse fixtures, factories, and helpers.
- If the miss was systemic (all tests used ISO dates, users type localized dates), add a small **realistic-data case set** so the whole field class is covered, not just this one value.
- In one line, note **why the old tests passed while the app broke** (e.g. "tests posted `2026-07-22`; the form emits `07/22/2026`") — that's the insight that prevents the next occurrence.
- Run the test suite and confirm the new test **fails without the fix and passes with it** (per [test-driven-development]).

## Common Mistakes

| Mistake | Consequence | Instead |
|---|---|---|
| Filling forms with `test` / `asdf` | Never triggers format bugs — same blind spot as the unit tests | Use the Realistic Data Playbook |
| Trusting the success toast | Silent coercion saves wrong data | Read the network response body + verify persistence |
| Testing only the happy-path fields | Optional/enum/array fields are where contracts break | Enumerate and fill *every* field |
| Guess-patching to make the error disappear | Masks the real cause, breaks something else | Diagnose via [systematic-debugging] first |
| Fixing the defect but not the tests | Same gap reopens on the next change | Every defect ends as a regression test |
| "Fixing" a valid backend rule on the frontend by mangling data | Corrupt data, hidden contract violation | Fix the real owner; surface ambiguous contracts |

## Validation Standard

A Real User QA pass is complete only when:
- data browsing and every filter were exercised (match, no-match, edge, reset) without errors
- every field in create and update was filled with realistic data and submitted
- the backend's actual response (status + body) and the persisted record were verified for each submit
- the edge matrix ran on high-risk fields
- every defect found was diagnosed to its real cause and fixed at the correct layer
- a regression test now reproduces each fixed defect and passes only with the fix
- a one-line explanation exists for why the prior tests missed each defect
