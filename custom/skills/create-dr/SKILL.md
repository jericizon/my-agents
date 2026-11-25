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
- **Reproducible hours.** `dr.py hours` computes every number. Never edit hours by hand.
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
- `workday_hours` defaults to 7.5. Change it only when the user gives a different workday.

## Step 4 — Resolve ticket titles

If Jira or Azure DevOps tools are available, look up every ticket key's summary in one search. Otherwise derive the title from the most representative commit or prompt. Never block the report on a missing integration.

## Step 5 — Compute hours

```bash
python3 <skill-dir>/scripts/dr.py hours <scratchpad>/evidence.json <scratchpad>/mapping.json
```

The script applies these rules. Restate them in the report's "How hours were estimated" section:

1. Each activity's events per day are clustered. A gap over 60 min starts a new block, and each block counts first → last event + 30 min.
2. A day over `workday_hours` is scaled down to it.
3. A day under it that has commits is filled up to it: non-commit activities keep their raw time, and committed activities share the rest.
4. Any other day keeps its raw time.
5. Each activity is rounded to the nearest 0.5h, with a minimum of 0.5h. On a scaled or filled day, the largest activity absorbs the rounding difference so the day totals exactly `workday_hours`.

Use the printed numbers as they are.

## Step 6 — Render

The report is Markdown, in this exact shape:

````markdown
# Work Report — <from> → <to> (git + server/ops activity)

- **Author:** <git user.name>
- **Workspace:** <workspace path>
- **Generated:** <YYYY-MM-DD>
- **Sources:** git (<N> commits across <R> repos) + Claude Code session logs (<S> sessions)
- **Active days:** <D>
- **Total estimated hours:** <T>h

## How hours were estimated

- <rules 1–5 from Step 5 in one bullet each, with the workday hours used>
- Not captured: meetings, Slack/email, browser-only work, and terminal work outside Claude Code.
- `[server]` marks work done on a remote server.

## Summary

| Date | Commits | Server work | Est. Hours |
|---|---|---|---|
| 2026-11-04 Wed | 4 | yes | 7.5h |
| **Total** | **25** | | **81h** |

No evidence found for weekdays <list>.   ← omit this line when the list is empty

## By Ticket / Activity

| Ticket | Activity | Est. Hours |
|---|---|---|
| VG-710 | Link Checker | 14h |
| — | HICMR testing environment restore and PHP upgrade | 5.5h |
| **Total** | | **81h** |

## Detail

### 2026-11-04 — 7.5h

**HICMR HARP 2 UAT fixes and data sync — 5.5h**
- `10:55` **hicmr/hicmr-harp2-web** `86a1eeb0` fix(admin): show RA tool versions from the schema id
- `[server]` Synced missing tool files from HICMR production to local and to staging/testing storage.

**VEOHRCSLA-100 — Anonymous CRT reports — 1h**
- Reviewed the CRT fix task list and hours; produced a per-task feasibility table.
````

Contract:

- **Summary:** one row per active date, in chronological order, with the weekday. Weekends are included when there is evidence. The line after the table lists weekdays with no evidence.
- **By Ticket / Activity:** sorted by hours, descending. The Ticket column is `—` when there is no key.
- **Detail:** one `###` section per date. Each activity is a bold line, `**TICKET — Title — Xh**`, or `**Title — Xh**` when there is no real ticket, followed by:
  - every commit verbatim as `` `HH:MM` **repo** `shortsha` subject ``
  - 1–4 past-tense bullets synthesised from the prompts and `R` lines
  - `[server]` at the start of any bullet whose work ran on a remote server
- **Server names:** use the server's role ("VG production web-3", "HICMR staging host"). Never write IPs, usernames, key file names or credentials.
- **Previous report:** if the user points to an earlier report for the same window, add a `Previous report` column to the Summary table and show the old totals beside the new ones in the header.

## Step 7 — Deliver

1. Save to `<workspace>/_shared/daily-reports/<from>-<to>.md`, running `mkdir -p` first. If the user named a location, or points to an earlier report, save next to it with a `-full` suffix. Never overwrite an existing report.
2. For a window of 3 days or fewer, print the whole report in chat. For longer windows, print the Summary table, the total and the file path.
3. Mention any credential warning from Step 2.

## Edge cases

- **No evidence in the window:** say so plainly and suggest a wider range or a different `--author`.
- **No ticket keys anywhere:** render the report with `—` tickets and descriptive activities.
- **No session logs:** the report is git-only. Say so in the Sources line.

## Common mistakes

| Mistake | Correct behaviour |
|---|---|
| Scanning only the current repository | `collect` scans the whole workspace, so run it from anywhere |
| Reporting only commits | Session prompts and `R` lines are evidence; server work gets `[server]` bullets |
| Hand-adjusting hours | Rerun `hours` with a better mapping; never edit the numbers |
| Guessing a ticket for keyless work | Use a descriptive activity key with `—` as the ticket |
| One bullet per prompt or command | Synthesise 1–4 bullets of what was achieved |
| IPs, usernames or tokens in bullets | Server roles only; credentials are reported to the user, never written down |
