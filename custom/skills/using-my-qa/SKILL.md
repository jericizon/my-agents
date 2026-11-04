---
name: using-my-qa
description: Use when the user asks for QA, real browser or headless end-to-end testing, live user-style validation against an already running application, or when tests pass but the app still breaks for real users. Drives the live UI (or the API directly) with realistic data, captures screenshots only as bug evidence, and rectifies every error found — diagnose, fix at the correct layer, re-run, lock in with a regression test.
---

# Using My QA

## Overview

Drive the live app like a real user — browse, filter, fill every field with real-world data, submit, and read the backend's actual response — then fix what breaks.

Unit tests pass because they feed the code the values the code expects. Real users type `07/22/2026` where the API wants `2026-07-22`, paste `$1,234.50` into a number field, leave optional fields blank, and select the enum the UI offers but the backend rejects. This skill surfaces those mismatches live, fixes them at the correct layer, and locks each one in with a regression test.

The through-line: **browse → filter → fill every field with realistic data → submit → read the real response → diagnose → fix → re-run → lock it in with a test.**

## When to Use

- the user asks for QA, end-to-end testing, or live user-style validation
- unit/integration tests are green but the running app throws errors, saves wrong data, or shows API validation failures
- you need to validate data browsing, filters, and create/update forms against a live backend
- you suspect a format/contract mismatch between what the UI sends and what the API accepts (dates, currency, decimals, phone, email, enums, nullability)

Do not use when:

- the request is only to write or run unit/integration tests (that's regular TDD)
- the app is not running and the user only wants startup help
- the user only wants a demo/walkthrough video → use `using-my-presenter`

## Core Rules

- Assume the app is already running. Never start `npm run dev`, `pnpm dev`, `docker compose`, or any server/watcher command.
- Default to **headless** execution or direct `curl`/HTTP. Never open a visible browser window unless the user asks to watch.
- Use one persistent browser session/context whenever possible so auth and workflow state carry through.
- Scan the repo first: route/page, form component, API endpoint + request schema/validator (Zod, DTO, serializer, DB constraints), existing E2E patterns and fixtures. The schema is the source of truth for "correct format".
- **Read the field before you fill it.** Type, `name`, `maxlength`, `pattern`, `required`, `min`/`max`/`step`, `<option>` values, and inline masks tell you what the backend likely expects.
- **Use real-world data, not `test`/`asdf`.** See the Realistic Data Playbook.
- **Read the backend's actual answer, not just the UI.** Check response status and body (or server logs) for every submit. A green toast can hide a silently coerced value.
- When something breaks, **diagnose the real cause before touching code** — invoke `systematic-debugging`. Do not guess-patch.
- Fix the **smallest safe thing** that removes the defect and preserves the flow. Frontend format bug → fix the frontend; genuine backend contract gap → fix the backend; ambiguous contract → surface it, don't silently pick a side. After every fix, rerun the failed portion first, then the full objective.
- **Every real defect ends as a regression test** that reproduces the exact failing input. Not optional — it is the point of the skill.
- **No video recording. Screenshots only as bug evidence** — capture a screenshot when a failure occurs so the bug is visible and reproducible, saved to `<project shared dir>/qa-artifacts/<timestamp>_<feature>/` (Shared Workspace Artifacts in global rules). Do not take milestone screenshots of passing steps.

## Runtime

### Preferred: Playwright MCP

Use the Playwright MCP server for navigation, interaction, page-state inspection, and screenshots when available. Run it headless.

### Fallback: Playwright CLI / isolated install

When no browser MCP is configured and no system browser exists, install Playwright in an
**isolated temp directory** so the target repo's `package.json`/lockfile stay clean:

```bash
WORK=$(mktemp -d) && cd "$WORK"
echo '{"name":"qa","private":true,"type":"module"}' > package.json
npm install --no-fund --no-audit playwright
PLAYWRIGHT_BROWSERS_PATH="$WORK/ms-browsers" npx playwright install chromium
```

Capture the real payloads the frontend emits headlessly:

```js
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on('request', r => { if (r.url().includes('/api/')) console.log('→', r.method(), r.url(), r.postData()); });
page.on('response', async r => { if (r.url().includes('/api/')) console.log('←', r.status(), await r.text().catch(() => '')); });
// ...drive the form with realistic data, submit, read what actually went over the wire...
```

Then replay/mutate those exact payloads via curl for the edge matrix:

```bash
curl -sS -X POST http://localhost:3000/api/invoices \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" \
  -d '{"dueDate":"07/22/2026","amount":"$1,234.50"}' -w '\n%{http_code}\n'
```

API-level (`curl`) is legitimate when the format contract is the whole question and you already know the frontend's output shape — don't invent a payload and call it "what the user sends."

If neither browser tooling nor HTTP access is possible, report `BLOCKED` with the exact reason.

## Workflow

1. **Scan the repo** — route/page, form component, API endpoint + schema, existing tests.
2. **Confirm the objective in user terms** — e.g. "a user can create an invoice with a due date and amount and it persists correctly."
3. **Browse the data** — lists/tables render, pagination works, empty states behave, no console/network errors on load.
4. **Exercise every filter** — matching value, non-matching value (clean empty state), boundary/edge value, and reset. Confirm the query the frontend sends matches what the backend expects.
5. **Enumerate every field** in the create form — including optional, hidden-until-toggled, and repeated/array fields. Miss none.
6. **Fill each field with realistic data** matched to its type (Realistic Data Playbook). Deliberately include formats real users produce that differ from the wire format.
7. **Submit and read the real response** — capture request payload + response status/body. Success = correct status AND the persisted record matches what you entered AND no silent coercion.
8. **Repeat for update** — pre-populated fields keep the right format; partial-update (PATCH) doesn't wipe untouched fields.
9. **Run the Edge Matrix** on the highest-risk fields.
10. **On any break: screenshot the failure state**, then diagnose via `systematic-debugging`, fix the smallest thing at the correct layer, re-run that case, then re-run the full objective.
11. **Fool-proof it** — for each defect fixed, add/update a test that feeds the exact failing input and asserts the corrected behavior, beside the existing tests, reusing fixtures. Confirm it fails without the fix and passes with it. Note in one line why the old tests missed it.
12. **Report** — what was exercised, what broke, the real cause, the fix, the test that now guards it, and where the bug-evidence screenshots live.

## Realistic Data Playbook

| Field type | Realistic value(s) | The format trap to probe |
|---|---|---|
| Date | `2026-07-22`, plus user-typed `07/22/2026` / `22-07-2026` | UI display format vs. API `YYYY-MM-DD` / ISO-8601 / epoch; timezone shifting the day |
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

## Bug Evidence

- Screenshot only on failure — the broken state, the error message, the wrong persisted value. Passing steps need no artifacts.
- Save to `<project shared dir>/qa-artifacts/<timestamp>_<feature>/` with incremental IDs (`001.png`, `002.png`), one per distinct failure.
- Each screenshot pairs with the request/response evidence for that failure in the report.

## Diagnosing a Break (don't guess-patch)

1. Read the **actual** error — response body, validation message, stack trace, server log. Not the generic toast.
2. Compare the **sent payload** to the **backend schema**. The mismatch is usually right there: format, type, casing, null-handling, or an extra/missing field.
3. Locate the boundary where it diverges: input mask → form state → serialization → request → API validator → DB constraint.
4. Decide ownership honestly: frontend sends wrong format → fix the frontend; backend contract genuinely too strict → fix the backend (flag it as a contract change); ambiguous → surface it.
5. Apply the smallest fix that preserves the flow. No opportunistic refactors.
6. Re-run the exact failing case, then the full objective.

## Validation Standard

A using-my-qa pass is complete only when:

- the page purpose was understood from the live UI and the main objective was actually reached
- data browsing and every filter were exercised (match, no-match, edge, reset) without errors
- every field in create and update was filled with realistic data and submitted
- the backend's actual response and the persisted record were verified for each submit
- the edge matrix ran on high-risk fields
- every defect found was diagnosed to its real cause, fixed at the correct layer, and revalidated by rerunning the failed portion then the full objective
- each failure has a screenshot in `<project shared dir>/qa-artifacts/<timestamp>_<feature>/`
- a regression test now reproduces each fixed defect and passes only with the fix
- a one-line explanation exists for why the prior tests missed each defect

## Blocked Conditions

Report `BLOCKED` when:

- the app is not running or not reachable
- the target route or objective cannot be inferred safely
- required auth or seed data is unavailable
- browser tooling is unavailable and no viable Playwright/HTTP fallback exists
- the blocker cannot be removed with a small, targeted fix that preserves the intended flow

Blocked output states the exact blocker and the minimum next action needed.
