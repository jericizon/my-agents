#!/usr/bin/env bash
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$REPO_ROOT/tests/assert.sh"
CONTROLLER="$REPO_ROOT/quota-recovery-controller.sh"

TEST_ROOT="$(mktemp -d)"
OTHER_PID=""
trap 'rm -rf "$TEST_ROOT"; [ -z "$OTHER_PID" ] || kill "$OTHER_PID" 2>/dev/null || true' EXIT
PROJECT="$TEST_ROOT/project"
HOME_DIR="$TEST_ROOT/home"
BIN="$TEST_ROOT/bin"
LAUNCH="$TEST_ROOT/launched.txt"
SINK="$TEST_ROOT/alerts.txt"
STATE_DIR="$PROJECT/.superpowers/recovery"
mkdir -p "$PROJECT" "$HOME_DIR" "$BIN"

# Fake harness CLI: records the resume arguments instead of starting a session.
cat >"$BIN/devin" <<'FAKE'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"$LAUNCH_FILE"
FAKE

# Fake pgrep. PGREP_MODE: none (no match), pid (report PGREP_PID), error (pgrep failure).
cat >"$BIN/pgrep" <<'FAKE'
#!/usr/bin/env bash
case "${PGREP_MODE:-none}" in
    pid) echo "$PGREP_PID"; exit 0 ;;
    error) exit 3 ;;
    *) exit 1 ;;
esac
FAKE

# Fake sleep. When RACE_MARK exists, simulates another controller claiming the same retry during the wait.
cat >"$BIN/sleep" <<'FAKE'
#!/usr/bin/env bash
if [ -n "${RACE_MARK:-}" ] && [ -f "$RACE_MARK" ]; then
    rm -f "$RACE_MARK"
    sed 's/^RETRY_COUNT=.*/RETRY_COUNT=1/' "$RACE_STATE" >"$RACE_STATE.tmp" && mv "$RACE_STATE.tmp" "$RACE_STATE"
    exit 0
fi
command -p sleep "$@"
FAKE
chmod +x "$BIN"/*

printf '#!/usr/bin/env bash\ncat >>"%s"\n' "$SINK" >"$TEST_ROOT/alert-sink.sh"
chmod +x "$TEST_ROOT/alert-sink.sh"

# ctl: runs the controller with the fakes first on PATH and the alert sink configured.
ctl() {
    env PATH="$BIN:$PATH" HOME="$HOME_DIR" LAUNCH_FILE="$LAUNCH" ALERT_COMMAND="$TEST_ROOT/alert-sink.sh" \
        PGREP_MODE="${PGREP_MODE:-none}" PGREP_PID="${PGREP_PID:-}" \
        RACE_MARK="${RACE_MARK:-}" RACE_STATE="${RACE_STATE:-}" \
        "$CONTROLLER" "$@"
}

state_file() { echo "$STATE_DIR/$1.state"; }
field() { grep -m1 "^$2=" "$(state_file "$1")" | cut -d= -f2-; }
now() { date +%s; }

# set_field <task> <KEY> <value>: test-only, simulates elapsed time or corruption.
set_field() {
    local f
    f="$(state_file "$1")"
    { grep -v "^$2=" "$f" || true; echo "$2=$3"; } >"$f.tmp"
    mv "$f.tmp" "$f"
}

# 1. record stores the schedule and writes history that excludes progress text and session IDs.
ctl record --harness devin --project "$PROJECT" --task-id t1 --session-id sess-abc --category quota \
    --progress "SECRET-PROGRESS-TEXT" --interval-seconds 300 >/dev/null
assert_eq "$(field t1 STATUS)" WAITING_FOR_QUOTA
assert_eq "$(field t1 RETRY_COUNT)" 0
assert_between "$(($(field t1 NEXT_RETRY_EPOCH) - $(now)))" 298 300
assert_contains "$STATE_DIR/t1.log" "level=info op=record corr=t1"
assert_not_contains "$STATE_DIR/t1.log" SECRET-PROGRESS-TEXT
assert_not_contains "$STATE_DIR/t1.log" sess-abc
pass "record: schedule stored; history excludes progress and session id"

# 2. Invalid numeric input is rejected before any state is written.
rc=0
ctl record --harness devin --project "$PROJECT" --task-id t2 --category quota --max-retries abc >/dev/null 2>&1 || rc=$?
assert_eq "$rc" 1 "non-numeric --max-retries must exit 1"
test ! -e "$(state_file t2)" || fail "invalid input must not write state"
rc=0
ctl record --harness devin --project "$PROJECT" --task-id t2b --category quota --interval-seconds 0 >/dev/null 2>&1 || rc=$?
assert_eq "$rc" 1 "--interval-seconds 0 must exit 1"
test ! -e "$(state_file t2b)" || fail "invalid input must not write state"
pass "invalid numeric input rejected before writing"

# 3. Blocked categories are never retried and alert once per failure event.
ctl record --harness claude --project "$PROJECT" --task-id t3 --category billing --interval-seconds 300 >/dev/null
assert_eq "$(field t3 STATUS)" BLOCKED
rc=0
ctl run --project "$PROJECT" --task-id t3 >/dev/null 2>&1 || rc=$?
assert_eq "$rc" 2 "run on a blocked category must exit 2"
assert_eq "$(count_matches "$SINK" "corr=t3")" 1 "blocked failure alerts exactly once"
pass "blocked category refused and alerted once"

# 4. --print-command shows the resume command without consuming a retry.
ctl record --harness devin --project "$PROJECT" --task-id t4 --session-id sess-abc --category quota \
    --interval-seconds 300 >/dev/null
set_field t4 NEXT_RETRY_EPOCH 0
rm -f "$LAUNCH"
out="$(ctl run --project "$PROJECT" --task-id t4 --print-command)"
assert_text_contains "$out" "devin -r sess-abc"
assert_eq "$(field t4 RETRY_COUNT)" 0 "printing the command must not consume a retry"
assert_eq "$(field t4 STATUS)" WAITING_FOR_QUOTA
test ! -e "$LAUNCH" || fail "--print-command must not launch"
pass "print-command does not consume a retry"

# 5. Declined or unconfirmed runs do not consume a retry and do not launch.
rc=0
ctl run --project "$PROJECT" --task-id t4 </dev/null >/dev/null 2>&1 || rc=$?
assert_eq "$rc" 5 "non-interactive run without --yes must exit 5"
assert_eq "$(field t4 RETRY_COUNT)" 0 "unconfirmed run must not consume a retry"
test ! -e "$LAUNCH" || fail "unconfirmed run must not launch"
pass "unconfirmed run does not consume a retry"

# 6. --yes launches once, claims the retry, and schedules the next one within the jittered bounds.
ctl record --harness devin --project "$PROJECT" --task-id t6 --session-id sess-xyz --category rate_limit \
    --interval-seconds 300 >/dev/null
set_field t6 NEXT_RETRY_EPOCH 0
ctl run --project "$PROJECT" --task-id t6 --yes >/dev/null
assert_contains "$LAUNCH" "-r sess-xyz"
assert_eq "$(field t6 RETRY_COUNT)" 1
assert_eq "$(field t6 STATUS)" READY_TO_RESUME
assert_between "$(($(field t6 NEXT_RETRY_EPOCH) - $(now)))" 149 300
pass "run --yes launches once and claims one retry"

# 7. Duplicate-session guard: fails closed for other processes and errors, ignores its own ancestry.
sleep 300 &
OTHER_PID=$!
ctl record --harness devin --project "$PROJECT" --task-id t7 --session-id sess-7 --category quota \
    --interval-seconds 300 >/dev/null
set_field t7 NEXT_RETRY_EPOCH 0
rm -f "$LAUNCH"
rc=0
PGREP_MODE=pid PGREP_PID="$OTHER_PID" ctl run --project "$PROJECT" --task-id t7 --yes >/dev/null 2>&1 || rc=$?
assert_eq "$rc" 3 "a live matching process must refuse the launch"
assert_eq "$(field t7 RETRY_COUNT)" 0 "refused launch must not consume a retry"
test ! -e "$LAUNCH" || fail "refused launch must not launch"

ctl record --harness devin --project "$PROJECT" --task-id t7b --session-id sess-7b --category quota \
    --interval-seconds 300 >/dev/null
set_field t7b NEXT_RETRY_EPOCH 0
rc=0
PGREP_MODE=pid PGREP_PID="$$" ctl run --project "$PROJECT" --task-id t7b --yes >/dev/null 2>&1 || rc=$?
assert_eq "$rc" 0 "the controller's own ancestry must not block its recovery"
assert_eq "$(field t7b RETRY_COUNT)" 1

ctl record --harness devin --project "$PROJECT" --task-id t7c --session-id sess-7c --category quota \
    --interval-seconds 300 >/dev/null
set_field t7c NEXT_RETRY_EPOCH 0
rc=0
PGREP_MODE=error ctl run --project "$PROJECT" --task-id t7c --yes >/dev/null 2>&1 || rc=$?
assert_eq "$rc" 3 "a failing duplicate check must fail closed"
assert_eq "$(field t7c RETRY_COUNT)" 0 "fail-closed must not consume a retry"
pass "duplicate guard: fail closed; own ancestry ignored"

# 8. Exhaustion is reported once, then stays exhausted.
ctl record --harness devin --project "$PROJECT" --task-id t8 --session-id sess-8 --category quota \
    --max-retries 1 --interval-seconds 300 >/dev/null
set_field t8 NEXT_RETRY_EPOCH 0
ctl run --project "$PROJECT" --task-id t8 --yes >/dev/null
set_field t8 NEXT_RETRY_EPOCH 0
rc=0
ctl run --project "$PROJECT" --task-id t8 >/dev/null 2>&1 || rc=$?
assert_eq "$rc" 4 "exhausted retries must exit 4"
assert_eq "$(field t8 STATUS)" EXHAUSTED
assert_eq "$(field t8 ALERTED)" 1
assert_eq "$(count_matches "$SINK" "corr=t8")" 1 "exhaustion alerts exactly once"
rc=0
ctl run --project "$PROJECT" --task-id t8 >/dev/null 2>&1 || rc=$?
assert_eq "$rc" 4 "a repeated run must stay exhausted"
assert_eq "$(count_matches "$SINK" "corr=t8")" 1 "repeated runs must not re-alert"
pass "exhaustion alerted once and stays terminal"

# 8b. Replay: a fresh failure event resets the budget, re-arms the alert, and can exhaust again.
ctl record --harness devin --project "$PROJECT" --task-id t8 --session-id sess-8 --category quota \
    --max-retries 1 --interval-seconds 300 >/dev/null
assert_eq "$(field t8 RETRY_COUNT)" 0 "a fresh failure event resets the retry budget"
assert_eq "$(field t8 ALERTED)" "" "a fresh failure event re-arms the alert"
set_field t8 NEXT_RETRY_EPOCH 0
ctl run --project "$PROJECT" --task-id t8 --yes >/dev/null
set_field t8 NEXT_RETRY_EPOCH 0
rc=0
ctl run --project "$PROJECT" --task-id t8 >/dev/null 2>&1 || rc=$?
assert_eq "$rc" 4 "the replayed event must exhaust again"
assert_eq "$(count_matches "$SINK" "corr=t8")" 2 "each failure event alerts once"
pass "replay after exhaustion re-arms and alerts once per event"

# 9. Corrupt state is rejected with a clear message instead of an arithmetic error.
ctl record --harness devin --project "$PROJECT" --task-id t9 --category quota --interval-seconds 300 >/dev/null
set_field t9 RETRY_COUNT abc
rc=0
out="$(ctl run --project "$PROJECT" --task-id t9 --yes 2>&1)" || rc=$?
assert_eq "$rc" 1 "corrupt state must exit 1"
assert_text_contains "$out" "RETRY_COUNT"
pass "corrupt state rejected with a clear error"

# 10. resolve is idempotent for the same outcome and refuses to overwrite a different one.
ctl record --harness devin --project "$PROJECT" --task-id t10 --category quota --interval-seconds 300 >/dev/null
ctl resolve --project "$PROJECT" --task-id t10 --outcome succeeded >/dev/null
ctl resolve --project "$PROJECT" --task-id t10 --outcome succeeded >/dev/null
rc=0
ctl resolve --project "$PROJECT" --task-id t10 --outcome failed >/dev/null 2>&1 || rc=$?
assert_eq "$rc" 1 "a different outcome must be refused"
assert_eq "$(field t10 OUTCOME)" succeeded
pass "resolve idempotent; conflicting outcome refused"

# 11. An unexpected failure is recorded with its location and does not leave a partial state.
mkdir -p "$TEST_ROOT/p11"
: >"$TEST_ROOT/p11/.superpowers"
rc=0
ctl record --harness devin --project "$TEST_ROOT/p11" --task-id t11 --category quota >/dev/null 2>"$TEST_ROOT/t11.err" || rc=$?
[ "$rc" -ne 0 ] || fail "an unexpected failure must not exit 0"
assert_contains "$TEST_ROOT/t11.err" "outcome=aborted"
pass "unexpected failure recorded and aborted"

# 12. A stale lock from a dead process is reclaimed; the lock is released afterwards.
bash -c 'exit 0' &
DEAD=$!
wait "$DEAD"
mkdir -p "$STATE_DIR"
mkdir "$(state_file t12).lock"
echo "$DEAD" >"$(state_file t12).lock/pid"
ctl record --harness devin --project "$PROJECT" --task-id t12 --category quota --interval-seconds 300 >/dev/null
test ! -e "$(state_file t12).lock" || fail "lock must be released after record"
pass "stale task lock reclaimed"

# 13. status echoes the record; unknown harnesses are refused.
out="$(ctl status --project "$PROJECT" --task-id t1)"
assert_text_contains "$out" "HARNESS=devin"
rc=0
ctl record --harness unknowncli --project "$PROJECT" --task-id t13 --category quota >/dev/null 2>&1 || rc=$?
assert_eq "$rc" 1 "unknown harness must exit 1"
pass "status roundtrip; unknown harness refused"

# 14. Workspace-rooted projects keep their state under _shared.
WS_HOME="$TEST_ROOT/ws-home"
WS_PROJECT="$WS_HOME/Workspace/clients/acme"
mkdir -p "$WS_PROJECT"
env HOME="$WS_HOME" PATH="$BIN:$PATH" LAUNCH_FILE="$LAUNCH" \
    "$CONTROLLER" record --harness devin --project "$WS_PROJECT" --task-id t14 --category quota --interval-seconds 300 >/dev/null
test -f "$WS_HOME/Workspace/_shared/clients/acme/.superpowers/recovery/t14.state" \
    || fail "state must live under _shared/clients/acme"
pass "workspace state under _shared"

# 15. Backoff stays capped and overflow-safe for large retry counts.
ctl record --harness devin --project "$PROJECT" --task-id t15 --session-id sess-15 --category quota \
    --max-retries 100 --interval-seconds 300 >/dev/null
set_field t15 RETRY_COUNT 70
set_field t15 NEXT_RETRY_EPOCH 0
ctl run --project "$PROJECT" --task-id t15 --yes >/dev/null
assert_eq "$(field t15 RETRY_COUNT)" 71
assert_between "$(($(field t15 NEXT_RETRY_EPOCH) - $(now)))" 1799 3600
pass "backoff capped and overflow-safe"

# 16. A retry claimed by another controller during the wait is not launched twice.
ctl record --harness devin --project "$PROJECT" --task-id t16 --session-id sess-16 --category quota \
    --interval-seconds 2 >/dev/null
: >"$TEST_ROOT/race-mark"
rm -f "$LAUNCH"
rc=0
RACE_MARK="$TEST_ROOT/race-mark" RACE_STATE="$(state_file t16)" ctl run --project "$PROJECT" --task-id t16 --yes >/dev/null 2>&1 || rc=$?
assert_eq "$rc" 3 "a concurrently claimed retry must not be launched again"
test ! -e "$LAUNCH" || fail "the losing controller must not launch"
assert_eq "$(field t16 RETRY_COUNT)" 1 "the concurrent claim must stand"
pass "compare-and-set claim prevents duplicate launch"

echo "PASS: quota-recovery-controller"
