#!/usr/bin/env python3
"""Evidence collector and hours calculator for the create-dr skill.

  dr.py collect --since 2026-11-01 --until 2026-11-24 [--workspace DIR] [--author NAME] --out evidence.json
  dr.py hours evidence.json mapping.json

Dates are local time. A bare --until date includes that whole day.
"""
import argparse, glob, json, os, re, subprocess, sys
from collections import defaultdict
from datetime import datetime, timedelta

TICKET = re.compile(r'\b([A-Z][A-Z0-9]{1,9}-\d{1,5})\b')
NOT_TICKET = set('CVE UTF ISO RFC SHA MD GHSA CWE AES RSA HTTP HTTPS IPV UTC ES PHP NODE PR'.split())
REMOTE = re.compile(r'\b(ssh|scp|rsync|sftp|kubectl|ansible|systemctl|journalctl|crontab|certbot|az|aws|gcloud)\b')
# Pasted tokens: known prefixes, or 40+ char mixed runs outside URLs/paths (hex ids and ssh public keys skipped).
SECRET = re.compile(r'\b(?:gh[pousr]_\w{30,}|github_pat_\w{30,}|glpat-[\w-]{20,}|xox[abprs]-[\w-]{20,}|AKIA[0-9A-Z]{16})\b'
                    r'|(?<![/:\w])(?![0-9a-fA-F]+\b|AAAA)(?=[A-Za-z0-9+=]*\d)(?=[A-Za-z0-9+=]*[A-Za-z])[A-Za-z0-9+=]{40,}\b')
IPV4 = re.compile(r'\b(?:\d{1,3}\.){3}\d{1,3}\b')
SKIP_DIRS = {'node_modules', 'vendor', '_shared', '.cache'}


def blocks(times):
    """Cluster sorted datetimes: a gap over 60 min starts a new block."""
    out = [[times[0], times[0]]]
    for t in times[1:]:
        if (t - out[-1][1]).total_seconds() > 3600:
            out.append([t, t])
        out[-1][1] = t
    return out


def parse_window(since, until):
    s = datetime.fromisoformat(since).astimezone()
    u = datetime.fromisoformat(until).astimezone()
    if len(until) == 10:
        u += timedelta(days=1)
    return s, u


def sh(args, cwd):
    return subprocess.run(args, cwd=cwd, capture_output=True, text=True, timeout=120).stdout


def find_repos(root):
    for d, dirs, _ in os.walk(root):
        if '.git' in os.listdir(d):
            g = os.path.join(d, '.git')
            if not (os.path.isfile(g) and '/worktrees/' in open(g).read()):  # worktrees repeat their main repo's commits
                yield d
            dirs[:] = []
            continue
        dirs[:] = [x for x in dirs if x not in SKIP_DIRS and not x.startswith('.')]
        if d.count(os.sep) - root.count(os.sep) >= 5:
            dirs[:] = []


def ticket_of(text):
    keys = [k for k in TICKET.findall(text) if k.split('-')[0] not in NOT_TICKET]
    return keys[0] if keys else None


def branch_ticket(repo, sha):
    out = sh(['git', 'branch', '-a', '--contains', sha, '--format=%(refname:short)'], repo).split()
    names = {n.removeprefix('origin/') for n in out if n not in ('origin', 'origin/HEAD')}
    keys = {ticket_of(n) for n in names}  # None = a keyless branch such as main
    return keys.pop() if len(keys) == 1 and None not in keys else None


def collect(a):
    s, u = parse_window(a.since, a.until)
    ws = os.path.expanduser(a.workspace)
    author = a.author or sh(['git', 'config', '--global', 'user.name'], ws).strip()
    commits, wip = [], []
    for repo in find_repos(ws):
        name = os.path.relpath(repo, ws)
        out = sh(['git', 'log', '--all', '--no-merges', f'--since={s.isoformat()}', f'--until={u.isoformat()}',
                  f'--author={author}', '--format=%H%x1f%cI%x1f%s%x1f%b%x1e'], repo)
        for rec in filter(str.strip, out.split('\x1e')):
            sha, ts, subj, body = (rec.strip().split('\x1f') + [''])[:4]
            key = ticket_of(subj + ' ' + body) or branch_ticket(repo, sha)
            t = datetime.fromisoformat(ts).astimezone().isoformat(timespec='minutes')  # git keeps the committer's offset
            commits.append({'id': sha[:8], 'repo': name, 'time': t, 'subject': subj, 'ticket': key})
        today = datetime.now().astimezone().replace(hour=0, minute=0, second=0, microsecond=0)
        if u > today:  # uncommitted work only counts for today; older mtimes are unreliable
            for line in sh(['git', 'status', '--porcelain'], repo).splitlines():
                p = os.path.join(repo, line[3:].strip('"'))
                if os.path.isfile(p):
                    t = datetime.fromtimestamp(os.path.getmtime(p)).astimezone()
                    if max(s, today) <= t < u:
                        wip.append({'id': f'wip:{name}', 'repo': name, 'time': t.isoformat(), 'file': line[3:]})
    sessions, flagged = defaultdict(lambda: {'events': [], 'prompts': [], 'remote': []}), set()
    hosts = {}  # same IP -> same alias, so servers stay distinguishable without exposing addresses

    def clean(text):
        text = SECRET.sub('[redacted]', ' '.join(text.split()))
        return IPV4.sub(lambda m: hosts.setdefault(m.group(), f'host{len(hosts) + 1}'), text)
    for f in glob.glob(os.path.expanduser('~/.claude/projects/*/*.jsonl')):
        sid, proj = os.path.basename(f)[:8], os.path.basename(os.path.dirname(f))
        for line in open(f, errors='replace'):
            try:
                r = json.loads(line)
            except ValueError:
                continue
            if r.get('type') not in ('user', 'assistant') or not r.get('timestamp'):
                continue
            t = datetime.fromisoformat(r['timestamp'].replace('Z', '+00:00')).astimezone()
            if not (s <= t < u):
                continue
            d = sessions[sid]
            d['project'] = proj
            d['events'].append(t.isoformat(timespec='minutes'))
            c = (r.get('message') or {}).get('content')
            if r['type'] == 'user' and not r.get('isMeta'):
                if isinstance(c, list):
                    c = ' '.join(x.get('text', '') for x in c if isinstance(x, dict) and x.get('type') == 'text')
                if isinstance(c, str) and c.strip() and not c.lstrip().startswith(('<', 'Caveat', '[Request interrupted')):
                    if SECRET.search(c):
                        flagged.add(sid)
                    if c.startswith('This session is being continued'):
                        c = '(context compacted; session continues)'
                    d['prompts'].append(f"{t:%m-%d %H:%M} " + clean(c)[:300])
            elif isinstance(c, list):
                for x in c:
                    cmd = (x.get('input') or {}).get('command', '') if isinstance(x, dict) and x.get('name') == 'Bash' else ''
                    if REMOTE.search(cmd):
                        d['remote'].append(f"{t:%m-%d %H:%M} " + clean(cmd)[:200])
    ev = {'since': s.isoformat(), 'until': u.isoformat(), 'author': author, 'commits': commits + wip,
          'sessions': {k: dict(v) for k, v in sessions.items()}, 'possible_secrets_in': sorted(flagged)}
    json.dump(ev, open(a.out, 'w'), indent=1)
    print(f"# author={author} commits={len(commits)} wip={len(wip)} sessions={len(sessions)} -> {a.out}")
    for c in sorted(commits + wip, key=lambda c: c['time']):
        print(f"C {c['time'][:16]} {c['id']} {c['repo']} [{c.get('ticket') or '-'}] {c.get('subject', c.get('file'))}")
    for sid, d in sorted(sessions.items(), key=lambda kv: kv[1]['events'][0]):
        days = sorted({e[:10] for e in d['events']})
        print(f"\nS {sid} {d['project']} {d['events'][0][:16]} -> {d['events'][-1][:16]} days={','.join(x[5:] for x in days)}")
        ts = [datetime.fromisoformat(e) for e in d['events']]
        print('  T ' + ' '.join(f'{a:%m-%d %H:%M}-{b:%H:%M}' for a, b in blocks(ts)))
        for p in d['prompts']:
            print('  P', p)
        for r in dict.fromkeys(x[:90] for x in d['remote']):
            print('  R', r)
    if flagged:
        print('\nWARNING: possible pasted credentials in sessions: ' + ', '.join(sorted(flagged)))


def round_half(h):
    return max(0.5, int(h * 2 + 0.5) / 2)


def hours(a):
    ev, mp = json.load(open(a.evidence)), json.load(open(a.mapping))
    W = float(mp.get('workday_hours', 7.5))
    rules, cmap = mp.get('sessions', []), mp.get('commits', {})
    pts = defaultdict(list)          # (date, activity) -> datetimes
    committed = defaultdict(set)     # date -> activities with a commit that day
    missing = [c['id'] for c in ev['commits'] if c['id'] not in cmap]
    if missing:
        sys.exit('Unmapped commits (map every commit, or to "ignore"): ' + ' '.join(sorted(set(missing))))
    for c in ev['commits']:
        act = cmap[c['id']]
        if act == 'ignore':
            continue
        t = datetime.fromisoformat(c['time']).astimezone()
        pts[(t.date(), act)].append(t)
        committed[t.date()].add(act)
    unmapped = defaultdict(int)
    for sid, d in ev['sessions'].items():
        for e in d['events']:
            t = datetime.fromisoformat(e)
            for p, day, lo, hi, act in rules:
                if sid.startswith(p) and day in ('*', f'{t:%m-%d}') and lo <= f'{t:%H:%M}' < hi:
                    if act != 'ignore':
                        pts[(t.date(), act)].append(t)
                    break
            else:
                unmapped[sid] += 1
    raw = defaultdict(dict)
    for (day, act), ts in pts.items():
        raw[day][act] = sum((b - a).total_seconds() / 3600 + 0.5 for a, b in blocks(sorted(ts)))
    totals, grand = defaultdict(float), 0
    for day in sorted(raw):
        r, tot = raw[day], sum(raw[day].values())
        if tot > W:
            est, target = {k: v * W / tot for k, v in r.items()}, W
        elif committed[day] & r.keys():
            free = W - sum(v for k, v in r.items() if k not in committed[day])
            com = sum(v for k, v in r.items() if k in committed[day])
            est = {k: (v * free / com if k in committed[day] else v) for k, v in r.items()}
            target = W
        else:
            est, target = dict(r), None
        est = {k: round_half(v) for k, v in est.items()}
        if target is not None:
            top = max(est, key=est.get)
            est[top] = max(0.5, est[top] + target - sum(est.values()))
        day_h = sum(est.values())
        grand += day_h
        print(f"{day:%Y-%m-%d %a}  {day_h:g}h  (raw {tot:.1f}h)")
        for k, v in sorted(est.items(), key=lambda kv: -kv[1]):
            totals[k] += v
            print(f"    {v:4g}h  {k}{'  [commit]' if k in committed[day] else ''}")
    print('\nBy activity:')
    for k, v in sorted(totals.items(), key=lambda kv: -kv[1]):
        print(f"    {v:5g}h  {k}")
    print(f"TOTAL {grand:g}h")
    if unmapped:
        print('Unmapped session events (ignored): ' + ', '.join(f'{k}={v}' for k, v in unmapped.items()))


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    sp = ap.add_subparsers(dest='cmd', required=True)
    c = sp.add_parser('collect')
    c.add_argument('--since', required=True)
    c.add_argument('--until', required=True)
    c.add_argument('--workspace', default=next((d for d in ('~/Workspace', '~/workspace')
                                                if os.path.isdir(os.path.expanduser(d))), '~/workspace'))
    c.add_argument('--author')
    c.add_argument('--out', required=True)
    h = sp.add_parser('hours')
    h.add_argument('evidence')
    h.add_argument('mapping')
    a = ap.parse_args()
    collect(a) if a.cmd == 'collect' else hours(a)
