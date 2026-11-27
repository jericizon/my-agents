---
name: create-dr
description: Use when the user asks for a daily report, DR, standup report, timesheet, work report, or a summary of what they worked on for a day or date range — "create dr", "generate my daily report", "what did I do yesterday/this week", "DR for nov 21", "report for nov 1 to nov 24" — including server maintenance, investigations, estimates and other work that never reached git.
---

# Create DR (Work Report)

## Overview

Build a per-day, per-activity work report for a local-time window across the whole workspace. Evidence comes from:

- git commits by the user in every repository under the workspace, plus today's uncommitted changes
- Claude Code session logs (`~/.claude/projects/*/*.jsonl`): what the user asked for, and commands run on remote servers (ssh, scp, rsync, systemctl, …)

That second source picks up the work git never sees: server maintenance, incident checks, data syncs, estimates, handovers and reviews.

Core principles:

- **Evidence or silence.** Every bullet traces to a commit or a session event. Never invent work to fill a day.
- **Read-only.** Never write to, stage or commit in the user's repositories, and never touch a remote server while building the report.
- **First-person outcome narrative.** The report should read like the user's own daily report: task accomplishments and outcomes, not assistant activity narration.
- **No implementation noise by default.** Omit estimated hours, commit ids, branch names, commit timestamps, and repository-path evidence lines unless the user explicitly asks for them.
- **Reproducible evidence mapping.** Use `dr.py hours` as an internal coverage check; do not surface its hour estimates unless requested.
- **No secrets.** Never copy tokens, passwords, keys or server IPs into the report.

## Step 1 — Resolve the window

Default: today, local midnight → now. Parse natural ranges in the machine's local timezone ("yesterday", "last week", "nov 1 to nov 24", "10pm nov 21 to 9pm nov 22"). Work belongs to the local calendar date it happened on.

## Step 2 — Collect evidence

```bash
python3 <skill-dir>/scripts/dr.py collect --since 2026-11-01 --until 2026-11-24 --out <scratchpad>/evidence.json
```

- `--until` with a bare date includes that whole day. Datetimes (`2026-11-21T22:00`) work for both ends.
- `--workspace` defaults to `~/Workspace`, else `~/workspace`. `--author` defaults to the global `git config user.name`.
- Output lines:
  - `C`: a commit in local time, or `wip:<repo>` for an uncommitted file changed today, with `[TICKET]` when one was found. The repo is its path relative to the workspace.
  - `S`: a session, with its project and time span.
  - `T`: the session's active blocks. Use them to pick slice boundaries.
  - `P`: a user prompt, cut to 300 characters.
  - `R`: a remote/server command. IPs appear as stable aliases (`host1`, `host2`, …); work out each server's role from the prompts.
- If the output ends with `WARNING: possible pasted credentials`, tell the user which sessions hold a pasted credential and that it is stored in plain text in the session log. Recommend revoking it. The evidence file already has it redacted.

## Step 3 — Map evidence to activities

Read every `S` block and decide what work it was. Write `<scratchpad>/mapping.json`:

```json
{
  "workday_hours": 7.5,
  "sessions": [
    ["9f97b724", "*",     "00:00", "24:00", "HICMR-QA"],
    ["180da22b", "11-20", "08:27", "08:51", "VEOHRC-REPORTS"],
    ["180da22b", "*",     "00:00", "24:00", "VG-HANDOVER"],
    ["5a1b2c3d", "*",     "00:00", "24:00", "ignore"]
  ],
  "commits": {"86a1eeb0": "HICMR-QA", "b43ebf63": "SUP-650", "wip:volunteering-gateway": "VG-HANDOVER"}
}
```

- Session rule: `[session id prefix, MM-DD or "*", from HH:MM, to HH:MM, activity]`. `from` is inclusive and `to` is exclusive. The first matching rule wins, so put time-sliced rules before the catch-all for the same session.
- Events that no rule matches are dropped, and `hours` lists their sessions at the end. Map them or confirm they should be ignored.
- Activity key, in order of preference:
  1. A ticket key from the commit, its branch, or a prompt that names the ticket ("check ticket CIP-323").
  2. Otherwise a short project-and-theme key, e.g. `VG-HANDOVER`, `HICMR-OPS` or `SSH-VULN-CHECK`. These keys are internal: the report shows `—` and a descriptive title instead.
- One key per piece of work. A session that changes topic gets one time slice per topic.
- Map every commit. `hours` refuses to run while any commit is unmapped. Use `"ignore"` for commits that are not work.
- Map sessions that only generated reports, or were idle chat, to `"ignore"`.
- `workday_hours` defaults to 7.5. It is only an input to the internal coverage calculation; do not show the resulting hours in the default report.

## Step 4 — Resolve ticket titles

If Jira or Azure DevOps tools are available, look up every ticket key's summary in one search. Otherwise derive the title from the most representative commit or prompt. Never block the report on a missing integration.

## Step 5 — Validate coverage internally

```bash
python3 <skill-dir>/scripts/dr.py hours <scratchpad>/evidence.json <scratchpad>/mapping.json
```

Use the output as an internal completeness check: unmapped commits, unmapped session events, or activities that were accidentally merged. Fix the mapping and rerun until the evidence is fully accounted for or intentionally ignored.

Do **not** copy the hour estimates into the default report. If the user explicitly asks for hours or a timesheet, use the printed numbers exactly and add only the hour columns/notes needed for that request.

## Step 6 — Render

The default report is a first-person, task-oriented Markdown report in this exact shape:

````markdown
# Work Report — <from> → <to>

- **Author:** <git user.name>
- **Generated:** <YYYY-MM-DD>
- **Active work date:** <date or dates>

## Summary

| Date | Work performed | Server changes |
|---|---|---|
| 2026-11-27 Fri | PBI implementation, validation, PR updates, QA evidence cleanup, and board triage | None |

No work evidence was found on <date> within the partial <time range> slice.   ← omit this line when empty

## Tasks Completed

| Ticket | Task |
|---|---|
| — | Reviewed my assigned PBIs and organized QA handoff readiness |
| PBI-18506 | Guarded staff-facing forms against stale server actions after deployment |
| PBI-18300 | Implemented the staff card org-chart Team field |

## Detail — 2026-11-27

**PBI readiness review and ticket triage**
- Reviewed my assigned PBIs and identified which items were ready for QA handoff and which were still blocked or externally dependent.
- Worked through the active tickets one at a time to avoid overlapping changes.

**PBI-18300 — Staff card Team, Direct Reports and Work Phone fields**
- Implemented the org-chart Team field on the staff card.
- Fixed the org-unit cache wiring, validated the regression tests and required gates, and opened PR 27541 for review.

**PBI-18506 — Stale page after deploy: guard staff-facing forms**
- Moved the stale-deploy guard into shared code and applied it to the affected staff-facing actions.
- Added regression coverage, passed the full test suite and build, and opened PR 27550.
````

Contract:

- Write as the user's own report. Use first-person possessive where helpful: “Reviewed my assigned PBIs…”, “Implemented…”, “Verified that I did not…”. Never write “the assistant”, “Reviewed only PBIs assigned to <name>…”, or other agent/activity-log narration.
- Use past-tense accomplishment bullets. Focus on what was completed, what was validated, what PR/ticket was updated, and any remaining blocker.
- The default report must omit estimated hours, hour-estimation explanations, commit ids, branch names, commit timestamps, repository-path evidence lines, and raw command lines. If the user explicitly asks for one of those details, include only the requested detail.
- Ticket numbers, PR numbers, blocker names, and environment names may remain when they are useful handoff evidence.
- **Summary:** one row per active date, in chronological order, with the weekday. Use `None` for server changes when no remote server or cloud environment was changed. The line after the table lists dates in the window with no evidence.
- **Tasks Completed:** no hours column. Use the same ordering as Detail; chronological execution order is preferred unless the user asks for another grouping. The Ticket column is `—` when there is no key.
- **Detail:** one `##` or `###` section per active date. Each activity is a bold line, `**TICKET — Title**`, or `**Title**` when there is no real ticket, followed by 1–4 first-person past-tense bullets synthesised from the prompts, commits, and `R` lines.
- `[server]` at the start of any bullet whose work ran on a remote server.
- **Server names:** use the server's role ("VG production web-3", "HICMR staging host"). Never write IPs, usernames, key file names or credentials.
- **Previous report:** if the user points to an earlier report for the same window, mention differences beside the new summary without restoring commit/branch/hour noise unless requested.

## Step 7 — Deliver

1. Save to `<workspace>/_shared/daily-reports/<from>-<to>.md`, running `mkdir -p` first. If the user named a location, or points to an earlier report, save next to it with a `-full` suffix. Never overwrite an existing report.
2. For a window of 3 days or fewer, print the whole report in chat. For longer windows, print the Summary table and the file path.
3. Mention any credential warning from Step 2.

## Edge cases

- **No evidence in the window:** say so plainly and suggest a wider range or a different `--author`.
- **No ticket keys anywhere:** render the report with `—` tickets and descriptive activities.
- **No session logs:** the report is git-only. Mention that limitation in chat without adding implementation noise to the report.

## Common mistakes

| Mistake | Correct behaviour |
|---|---|
| Scanning only the current repository | `collect` scans the whole workspace, so run it from anywhere |
| Reporting only commits | Session prompts and `R` lines are evidence; server work gets `[server]` bullets |
| Showing internal evidence noise by default | Keep commit ids, branch names, timestamps, repository paths, and hour estimates out unless the user explicitly asks for them |
| Writing assistant narration | Write first-person user accomplishments such as “Implemented…” or “Reviewed my assigned PBIs…” |
| Guessing a ticket for keyless work | Use a descriptive activity key with `—` as the ticket |
| One bullet per prompt or command | Synthesise 1–4 bullets of what was achieved |
| IPs, usernames or tokens in bullets | Server roles only; credentials are reported to the user, never written down |
