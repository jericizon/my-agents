# Creating Playwright E2E Tests Skill Design

Design a standalone skill for requests to create or update a Playwright E2E spec file for a target page, route, or feature. The skill must inspect the implementation first, generate a human-readable adjacent test-case artifact, generate or update the Playwright spec, then validate it in the same session without starting the application itself.

## Motivation

The existing QA skills in this repository are broad orchestration skills:
- `qa-testing` coordinates planning, execution, and documentation for a full QA pass.
- `qa-planning` discovers behavior and risks before test generation.
- `qa-execution` focuses on generating, running, and fixing Playwright tests.

Those skills are useful, but they are broader than the narrow request pattern: "create an E2E test file for this page or feature." The new skill should optimize for that direct authoring flow while reusing the discipline of the current QA skills.

## Problem Statement

When the user asks to create or update a Playwright E2E test file, the agent currently risks one of two failures:
- treating the request as generic implementation work and writing a spec without first understanding the target page or workflow
- forcing the broader `qa-testing` flow even when the user only wants an E2E file authored and validated

The new skill should narrow that path. It must:
- identify or infer the target page, route, or feature from the repo
- confirm the target only when the scan is ambiguous or high-risk
- inspect forms, auth requirements, and existing test patterns before writing code
- use Playwright to inspect the live target page when needed, especially for forms and interactive inputs
- keep authenticated state persistent for related cases so the browser is not re-booted for every test
- prefer dynamic input values to improve bug detection

## Proposed Skill

### Name

`creating-playwright-e2e-tests`

### Description

`Use when creating or updating a Playwright E2E spec file for a page, route, or feature that must be inspected first and validated in the same session.`

### Positioning

This is a standalone top-level skill, not a replacement for `qa-testing`.

Use this skill when the user intent is specifically to author or update a Playwright E2E spec file.

Do not use this skill when the user asks for:
- a complete QA sign-off across a broader feature or release
- a pure execution-only QA pass against already-written specs
- application setup, Playwright installation, or dev server bootstrapping

## Behavior

The skill must follow this end-to-end workflow:

1. Detect that the request is to create or update a Playwright E2E spec file.
2. Scan the repository to infer the likely target page, route, or feature.
3. Inspect related routes, pages, components, APIs, forms, and existing tests before writing any spec code.
4. When the page has forms or significant interactive inputs, use Playwright against the running app to inspect the live page, identify the fields that require coverage, and confirm how those inputs behave.
5. If the target inference is ambiguous or the route-to-feature mapping is risky, ask the user for a focused clarification and confirm the inferred target.
6. Create a human-readable test-case artifact adjacent to the generated spec file.
7. Generate or update the Playwright `.spec.ts` file using existing repo patterns where possible.
8. Run the spec in the same session.
9. If failures are due to safe-to-fix spec issues such as selector drift, waits, or test logic, fix the spec and rerun.
10. Report the result as generated, updated, validated, or blocked with a concrete reason.

## Affected Surface

The design assumes the implementation will primarily affect:
- `custom/skills/creating-playwright-e2e-tests/SKILL.md`
- any small supporting references or examples needed by that skill
- skill tests if the repository has or adds pressure scenarios for authoring-skill behavior

The skill must operate against target repositories that already contain:
- application code for the page or feature under test
- a Playwright setup or an existing E2E test layout

The skill must inspect the target repository first to determine:
- where similar Playwright specs live
- whether auth helpers, fixtures, or data builders already exist
- which selector conventions are already used

When the target contains forms or complex interactive controls, the skill should also inspect the live page with Playwright to confirm field presence, labels, control types, disabled states, and user-visible behavior before finalizing the generated spec.

## File Outputs

For each target feature, the skill should produce two adjacent files in the repo-under-test:
- `<feature>.spec.ts`
- `<feature>.spec.md`

The skill must not hardcode a test directory. It should discover the existing Playwright structure in the target repository and place files beside similar specs.

The `.spec.md` file is the human-readable companion artifact. It exists to preserve the test intent beside the executable test.

## Companion Case Artifact Requirements

The adjacent `.spec.md` file must capture:
- target page, route, or feature
- inferred entry path and navigation assumptions
- auth assumptions and prerequisites
- key user flows covered
- forms present on the page
- which fields were confirmed from the live page via Playwright inspection when applicable
- required and optional fields
- validation expectations
- input-behavior expectations such as typing, selection, masking, formatting, or enable/disable state
- dynamic data strategy
- happy-path case list
- invalid-input and edge-case coverage
- regression risks being covered
- assumptions, limitations, and blockers

The case artifact should be concise but specific enough that another agent can understand why the generated spec exists and what it covers.

## Playwright Spec Requirements

The generated or updated `.spec.ts` file must:
- inspect and reuse existing fixtures, helpers, auth utilities, and selector conventions when they already exist
- prefer semantic selectors first, then project-standard test IDs, then fallback selectors only when needed
- use dynamic input data by default unless the user explicitly requests fixed values
- keep helper creation minimal and only add shared helpers when repetition or complexity justifies it
- cover the relevant happy path, invalid input, edge cases, and realistic regressions for the target workflow

### Auth And Session Behavior

For authenticated flows, the default behavior is to preserve session state across related cases with one browser boot.

The preferred pattern is:
- one browser launch for the related suite
- a persistent browser context and page
- serial navigation through related cases when this preserves realistic workflow state

The skill should avoid relogging or re-booting a browser for every test case unless isolation is clearly necessary to avoid false positives or corrupted later checks.

### Form Analysis Requirements

When the target page contains forms, the skill must inspect and document:
- visible inputs and controls
- fields confirmed through live Playwright page inspection when applicable
- implied required fields based on labels, validation, disable states, or submit behavior
- optional fields
- accepted input shapes where discoverable
- likely validation rules and submission outcomes
- whether each important input appears to work correctly under normal user interaction such as typing, selecting, clearing, or toggling

The generated tests should use that analysis to avoid shallow "fill every field with static lorem ipsum" behavior.

At minimum, form-oriented specs should verify that important inputs are actually operable:
- text inputs accept valid typing and reflect the entered value
- selects, comboboxes, radios, or checkboxes can be changed as expected
- masked or formatted inputs behave correctly during entry when applicable
- disabled or conditionally enabled fields transition as intended
- submission-relevant fields participate correctly in validation and success flow

### Dynamic Data Requirements

Input data should be as dynamic as practical by default. The goal is to improve bug detection and reduce brittle false confidence from repeated hardcoded values.

Preferred order:
1. reuse existing test data builders or helper utilities from the target repo
2. otherwise generate lightweight dynamic values inline inside the spec
3. only introduce a new shared helper when the same data pattern repeats enough to justify extraction

Examples of acceptable dynamic values:
- timestamp-based names
- unique emails
- randomized but valid text payloads
- generated numeric ranges within valid boundaries

## Runtime Assumptions

The skill must assume the target application is already running.

The skill must not:
- start a dev server
- start a watcher
- run docker compose to boot the app

If validation requires a running app and the app is unavailable, the skill must stop and report a blocked state with the concrete reason.

## Validation And Recovery Behavior

The skill is incomplete until it attempts an actual validation run in the same session.

After generating or updating the spec, the skill must run the relevant Playwright command for the target repo and inspect the result.

Allowed automatic follow-up actions:
- adjust selectors
- improve waits or sequencing
- refine field coverage after live page inspection reveals missing or incorrect input assumptions
- fix test data assumptions
- align the generated spec with the discovered implementation

Disallowed automatic follow-up actions:
- faking a pass
- removing assertions only to silence failures
- skipping execution and claiming completion
- starting the app to satisfy missing runtime prerequisites

## Blocked Conditions

The skill must report `BLOCKED` when validation cannot proceed or cannot be completed safely because of conditions such as:
- target page or route cannot be confidently identified from the repo scan
- the app is not running or not reachable
- required auth credentials or seed data are unavailable
- the target flow is too ambiguous to encode without user confirmation
- the repo lacks a usable Playwright setup and the request is only to create a spec, not bootstrap Playwright from scratch

The blocked output must name the exact reason and the minimal next input or environment change required.

## Relationship To Existing QA Skills

This skill should explicitly coexist with the current QA stack:

- `qa-testing` remains the orchestrator for comprehensive QA planning, execution, documentation, and sign-off.
- `creating-playwright-e2e-tests` is narrower and optimized for authoring a Playwright spec plus its adjacent case artifact.
- The new skill may reuse the good behavioral discipline of `qa-planning` and `qa-execution`, but it should not require the full three-skill QA chain for every file-authoring request.

This boundary prevents catalog duplication while keeping the authoring workflow fast and direct.

## Permissions And Safety Rules

The skill must:
- scan the target implementation before changing anything
- follow the target repo's existing Playwright and selector patterns
- keep changes minimal and reusable
- avoid inventing abstractions unless repetition justifies them

The skill must not:
- assume routes, forms, or auth behavior without inspecting the code
- overwrite unrelated existing specs blindly
- create speculative framework-wide helpers for one small test
- ignore ambiguity when the inferred target is uncertain

## Non-Goals

Out of scope for this skill:
- full product-level QA certification
- starting or managing runtime processes
- Playwright installation from scratch
- test environment provisioning
- cross-browser matrix expansion unless already part of the target repo's normal flow
- broad documentation outside the adjacent case artifact

## Acceptance Criteria

- The skill triggers on requests to create or update a Playwright E2E test file.
- The skill scans the repo to infer the likely target page, route, or feature.
- The skill asks for confirmation only when the target inference remains ambiguous or risky.
- The skill analyzes implementation details before writing tests.
- When forms or interactive inputs are present, the skill uses Playwright to inspect the live page and identify the fields that need coverage.
- The skill creates an adjacent human-readable test-case artifact beside the executable spec.
- The skill generates or updates the `.spec.ts` file in the repo's existing Playwright structure.
- The generated spec uses dynamic input data by default unless the user asks for fixed values.
- For related authenticated flows, the generated spec preserves session state with one browser boot by default.
- For form-oriented pages, the generated spec verifies that important input fields are operable and behave correctly, not just that submission succeeds.
- The skill validates the generated or updated spec in the same session.
- The skill never starts the application itself.
- The skill reports explicit blocked reasons when validation cannot be completed.

## Testing Expectations For The Skill

Implementation planning should cover at least these verification angles:
- trigger quality for requests about creating or updating Playwright E2E specs
- target-discovery behavior when the repo clearly maps the request to an existing page or flow
- clarification behavior when multiple possible targets match the request
- generation of both adjacent artifacts
- session-persistence guidance for authenticated flows
- form-analysis guidance for pages with visible and implied required fields
- live Playwright page inspection for form-heavy targets
- input-operability coverage for critical fields
- dynamic-data guidance that avoids brittle static fixtures by default
- blocked reporting when the app is not running or Playwright cannot validate

## Risks

- Overlap with `qa-testing` if the skill description becomes too broad
- False target inference when route names and feature names diverge
- Over-coupled serial tests if persistent-state guidance is applied without judgment
- Fragile generated tests if the skill ignores existing helper patterns in the target repo

## Recommended Implementation Direction

Keep the first implementation narrow:
- one new skill directory
- minimal supporting references only if needed
- reuse existing QA language and patterns where it improves discipline
- avoid building a second full QA orchestrator

That keeps the skill aligned with the request: create or update a Playwright E2E test file intelligently, validate it in the same session, and preserve the reasoning beside the generated spec.
