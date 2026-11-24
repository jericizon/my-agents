---
name: create-dr
description: Use when the user asks for a daily report, DR, standup report, or a summary of what they worked on in the current repository for a day or date range — "create dr", "generate my daily report", "what did I do yesterday/this week", "DR for nov 21". Scans git history and uncommitted work within a local-time window and renders a per-day, per-ticket report with time estimates.
---

# Create DR (Daily Report)

## Overview

Generate a copy-paste-ready daily work report from the repository the user is standing in. Evidence comes from git history plus uncommitted working-tree activity inside a **local-time** window. Output is grouped by calendar date, then by ticket, with an estimated time spent and itemized bullets of the actual work.

Core principles:

- **Evidence or silence.** Every bullet traces to a commit, diff, or file change. Never invent work to fill a day. An empty window is reported as empty.
- **Read-only.** Never write to, stage, commit, or otherwise modify the user's repository.
- **Estimates are estimates.** Time spent is inferred from timestamps, never measured. Always render it as a rough estimate.

## Step 1 — Resolve the time window

Ask the user which report to generate if they haven't said. Default: **today, local midnight → now**.

Parse natural ranges in the machine's **local timezone** (never UTC unless the user says so):

- "today", "yesterday" → local midnight to midnight (or now, for today)
- "10pm nov 21 to 9pm nov 22" → that exact span; overlapping days are fine
- "last week", "nov 10 to nov 22" → multi-day spans produce one section per calendar date

Work is attributed to the **local calendar date on which it happened** — a commit at 11pm Nov 21 belongs to the November 21 section even if the window ends Nov 22.

## Step 2 — Gather evidence

### Commits

Author-filter to the user. Default email: `git config user.email` (fall back to `git config user.name`). Only scan all authors if the user explicitly asks.

```bash
git log --all --no-merges \
  --since="<start ISO local>" --until="<end ISO local>" \
  --author="<user email>" \
  --date=iso-strict-local \
  --format='%H|%cI|%s' --name-only
```

- `--all` matters: work happens on feature branches, not just the current one.
- `--no-merges`: merge commits are mechanical noise.
- `--since/--until` compare committer date; passing local wall-clock datetimes keeps the window in local time. Confirm the machine timezone with `date` once if a boundary looks off.
- Also read commit bodies (`git log --format='%B'`) when the subject alone doesn't explain the work.

### Uncommitted work

WIP that was never committed still counts as work done:

```bash
git status --porcelain
```

For each modified/untracked path, check its mtime falls inside the window (`find <path> -newermt "<start>" ! -newermt "<end>"` or `stat`). Include uncommitted work only for windows covering **today** — old uncommitted mtimes are unreliable history. Attribute it to a ticket only by the same rules as commits (current branch name key); otherwise it goes to Others, labeled as uncommitted/WIP.

### What to ignore

- Commits outside the window, other authors' commits (even on ticket branches)
- Files under `.git/`, dependency dirs, build output
- Previously generated reports (`daily-reports/`) — never let past output become evidence
- Nothing else: when in doubt, include the evidence and let the report reflect it

## Step 3 — Group by ticket

Ticket keys match `\b[A-Z][A-Z0-9]+-\d+\b` (covers `VG-123`, `PBI-18261`). Scan commit subjects, bodies, and branch names.

Attribution, in order:

1. **Key in the commit message** → that ticket.
2. **No key in the message** → run `git branch --all --contains <sha>` and ignore remote duplicates of the same branch. If the commit is contained ONLY in branches whose names carry a ticket key, and exactly one distinct key appears across them → that ticket. This captures unmerged WIP on a ticket branch. If the commit is also contained in any keyless-named branch (`main`, `master`, `develop`, …) its provenance is unknowable → rule 3.
3. **Otherwise** → the `Others` section. Never guess a ticket for a keyless commit — wrong attribution is worse than an honest Others entry. Wrong attribution also corrupts the time estimate, since the commit's timestamp joins the ticket's sessions.

## Step 4 — Resolve ticket titles

For each ticket key:

1. **If the session has Jira or Azure DevOps access** — MCP tools with jira/azure/devops in their names, or a working `az boards`/jira CLI — look up the real ticket summary/title. Use branch-linked tickets to confirm the match.
2. **Otherwise (or if lookup fails)** → derive the title from the ticket's most representative commit message: strip the conventional-commit prefix (`feat(VG-123):`, `fix:`) and the ticket key, use what remains in sentence form.

Never block the report on a missing integration — the fallback always works.

## Step 5 — Estimate time per ticket

For each ticket, per calendar date:

1. Collect all its event timestamps (commits; WIP file mtimes for today).
2. Sort; a gap over **60 minutes** starts a new session.
3. Session duration = (last event − first event) + 30 minutes. Sum the sessions.
4. Round to the nearest 5 minutes. Render as `[2h 30m]`, `[45m]`, `[1h]`.

Same rule for the Others section. Do not editorialize the number up or down — the user adjusts it themselves; the value must be reproducible.

## Step 6 — Render

Exact output shape — plain text, no markdown headers, no commit hashes, no file:line citations:

```
November 21
VG-123 - Login redirect fix [2h 30m]
- Fixed token refresh race in auth interceptor
- Added regression test for expired refresh token path

PBI-18261 - Invoice export corrections [1h 55m]
- Corrected export date format
- Extracted CSV writer into standalone module

Others [30m]
- Bumped dependencies
```

Rules:

- Date headers are plain `Month D` lines, one section per active date, chronological order. Omit dates with no activity.
- Ticket line: `KEY - Title [Xh Ym]`. Others line: `Others [Xm]` (no dash title).
- Bullets: brief, human, past-tense standup items synthesized from what changed — what a teammate understands. 1–6 bullets per ticket. Not a raw commit dump: merge trivially-related commits into one bullet, drop noise.
- Blank line between ticket blocks.
- For multi-day spans repeat the structure under each date; the same ticket may appear under several dates with that day's time only.

Then:

1. Print the report in chat.
2. Save it to `<project shared dir>/daily-reports/<end-date-YYYY-MM-DD>-dr.md` per the Shared Workspace Artifacts contract (e.g. `~/Workspace/_shared/<project>/daily-reports/`), `mkdir -p` first. Tell the user the path.

## Edge cases

- **No activity in window** → say so plainly, don't fabricate. Suggest widening the range or checking the author filter.
- **No ticket keys anywhere** → still render the report, everything under Others.
- **Non-git directory** → fall back to file mtimes alone, everything under Others, and say the git evidence was unavailable.
- **Window in the future / empty repo** → report empty; never invent content.

## Common mistakes

| Mistake | Correct behavior |
|---|---|
| Markdown `##` headers, commit hashes, `file.js:23` citations | Plain-text template exactly as shown — it's copy-pasted into report tools |
| Attributing keyless commits to a plausible ticket | Others section; guessing misreports the user's day |
| UTC day boundaries | Local timezone, always — overlapping days are the point |
| Missing feature-branch work | `git log --all`, never just the current branch |
| Including teammates' commits on shared branches | Author-filter to the user by default |
| Precise-looking times (`2h 37m` from thin air) | The session-clustering rule, reproducibly; it's an estimate |
| Dumping one bullet per commit | Synthesize: brief items of what was accomplished |
