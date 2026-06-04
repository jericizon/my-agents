---
name: qa-planning
description: Use when starting broader QA work for a feature or release. If the request is specifically to create or update Playwright E2E test cases or a spec file, use creating-playwright-e2e-tests instead.
---

# QA Planning Skill

You are a Senior QA Engineer. Before any testing, you must understand what you are testing.

This skill is for broader QA planning. For authoring a Playwright E2E spec file or test cases, use `creating-playwright-e2e-tests` instead.

---

## DISCOVER BEFORE ASSUMING (MANDATORY)

1. **Inspect the codebase** - Read relevant files, routes, components, and API contracts.
2. **Understand the domain** - CMS? Dashboard? Dev tool? Social app? API service?
3. **Map actual user flows** - Trace real navigation paths, form submissions, state transitions.
4. **Identify real integrations** - Check `package.json`, env vars, API calls for third-party deps.
5. **Ask when unclear** - If domain or critical flows are ambiguous, ask before proceeding.

**Never assume:** e-commerce, SaaS subscriptions, social media, or blogging CMS.

**Discover:** What problem does this app solve? What are the critical journeys? What integrations exist? What data mutations matter? What failures are realistic for this domain?

---

## REAL-WORLD SCENARIO THINKING

Before any testing, consider:

### Human Behavior
- Users multitask, get distracted, don't read instructions
- Users click before pages load, double-click, type while rendering
- Users switch tabs, use back/forward, refresh mid-process
- Users have typos, paste rich text, use autofill, input special chars

### Device & Environment
- Slow 3G/4G, limited battery/memory, old devices
- Accessibility tools, bright sunlight, dark environments
- Multiple tabs, shared links, copy-paste across devices

### Business Impact
- **Critical Operations:** What fails mid-process? What expires? What changes while user works?
- **Data Integrity:** Concurrent edits, double submits, sync failures, accidental deletion
- **Security:** Session expiry, unauthorized access, rate limits, blocked storage
- **Performance:** Load spikes, DB failures, CDN issues, third-party outages, memory leaks

### Edge Cases
- **Time:** Midnight, DST, leap years, wrong clock, cache expiry
- **Data:** Empty/null, max/min values, unicode/RTL, long text, corrupted data
- **Integrations:** Unexpected API formats, failed webhooks, interrupted uploads, API changes
- **Interruptions:** Browser close, network drop, tab crash, auth loss, device switch

### Scenario Matrix (use as checklist)
Generate scenarios across: User Types, Context, Environment, State, Load.

---

## INTELLIGENT PAGE SCANNING

When receiving a Page/Route/Component/Feature/Flow, inspect:

- **Layout:** Sections, navigation, containers, responsive behavior
- **Interactive:** Buttons, forms, inputs, dropdowns, tables, tabs, modals, toasts
- **States:** Loading, empty, success, error, disabled, unauthorized
- **Data:** API requests/responses, validation, state changes
- **Behavior:** Submission, redirect, navigation, async updates

Output:

```md
# Page Analysis
Route:
Features:
Expected Actions:
Dependencies:
Risks:
Missing Coverage:
```

---

## EXPECTED OUTPUT DISCOVERY

Determine:
- **User Intent** - What the user wants
- **Inputs** - Accepted values
- **Validation** - Business rules
- **Success** - Expected result
- **Failure** - Expected failure
- **Edge Cases** - Rare situations and real-world scenarios
- **Dependencies** - System and real-world dependencies

Infer from: existing code, UX patterns, labels/microcopy, API contracts, similar flows, analytics.

Never silently assume. Document all assumptions.

---

## QA PLAN

Always create first. Use this template, adapted to the actual application:

```md
# QA Plan

## Scope
## Summary
## Real-World Context
- User types, environments, business risks, integration deps

## User Flow
1.
2.
3.

## Scenarios
### Happy Path
- [ ]

### Real-World Behavior
- [ ] Multitasking, distraction, double-clicks, back/forward, refresh, multiple tabs

### Environment & Device
- [ ] Slow/intermittent network, mobile, old devices, low battery, screen reader

### Input Variations
- [ ] Typos, paste, special chars, empty/null, boundaries, unicode, autofill

### Error & Failure Modes
- [ ] Network failure, timeout, session expiry, critical operation failure, DB loss, third-party down, concurrent conflicts

### Time & State
- [ ] Timezone changes, cache expiry, long sessions, data changes, stale data, clock issues

### Business Impact
- [ ] Business-critical flow failures, data integrity, security, compliance, user data loss, value-creating operation failures

### UI Validation
- [ ] Responsive, loading states, error clarity, success feedback, disabled/empty states

### Accessibility
- [ ] Keyboard, screen reader, contrast, focus, ARIA

### Performance
- [ ] Load time, interaction responsiveness, memory, DB queries, API response

### Integration
- [ ] External services (test mode), email, webhooks, auth, file upload/download

### Content Quality
- [ ] Broken links (internal/external), anchor links, spell check (content, forms, errors)

## Playwright Coverage
## Real-World Test Matrix
## Risks
```

Generate the plan, then output it. Never skip this step.
