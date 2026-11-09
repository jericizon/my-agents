#!/usr/bin/env bash
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$REPO_ROOT/tests/assert.sh"
source "$REPO_ROOT/lib/reliability.sh"

TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEST_ROOT"' EXIT

# backoff_seconds: delay = min(cap, base * 2^(n-1)), jittered into [delay/2, delay].
for attempt in $(seq 1 12); do
    expected=$((2 << (attempt - 1)))
    [ "$expected" -le 30 ] || expected=30
    for _ in $(seq 1 20); do
        assert_between "$(backoff_seconds "$attempt" 2 30)" $((expected / 2)) "$expected"
    done
done
distinct="$(for _ in $(seq 1 30); do backoff_seconds 1 300 3600; done | sort -u | wc -l | tr -d ' ')"
[ "$distinct" -gt 1 ] || fail "backoff must be jittered; 30 samples were identical"
assert_between "$(backoff_seconds 1000000000 300 3600)" 1800 3600
assert_eq "$(backoff_seconds 3 0 30)" 0
pass "backoff_seconds: exponential, capped, jittered, overflow-safe"

line="$(LOG_CORRELATION_ID=task-1 event_line info record outcome=recorded)"
re='^ts=[^ ]+ level=info op=record corr=task-1 outcome=recorded$'
[[ "$line" =~ $re ]] || fail "unexpected event line: $line"
pass "event_line: key=value format with correlation id"

LOG_FILE="$TEST_ROOT/events.log" LOG_CORRELATION_ID=c1 log_event warn op1 attempt=2 2>"$TEST_ROOT/stderr.log"
assert_contains "$TEST_ROOT/events.log" "level=warn op=op1 corr=c1 attempt=2"
assert_contains "$TEST_ROOT/stderr.log" "level=warn op=op1 corr=c1 attempt=2"
pass "log_event: writes to stderr and LOG_FILE"

(require_int THING 5 1) || fail "5 should satisfy >= 1"
for bad in 0 -1 abc "" 1234567890123; do
    if (require_int THING "$bad" 1) 2>/dev/null; then fail "'$bad' should be rejected"; fi
done
pass "require_int: rejects non-integers, values below minimum, and overflow-prone sizes"

LOCK="$TEST_ROOT/lock"
(
    acquire_lock "$LOCK" 0
    if (acquire_lock "$LOCK" 0) 2>/dev/null; then fail "second holder acquired a held lock"; fi
    release_lock "$LOCK"
    acquire_lock "$LOCK" 0
)
test ! -e "$LOCK" || fail "EXIT trap must release the lock"

bash -c 'exit 0' & DEAD=$!
wait "$DEAD"
mkdir "$LOCK" && echo "$DEAD" >"$LOCK/pid"
( acquire_lock "$LOCK" 0 ) || fail "a lock held by a dead PID must be reclaimed"
test ! -e "$LOCK" || fail "reclaimed lock must be released on exit"

sleep 300 & LIVE=$!
mkdir "$LOCK" && echo "$LIVE" >"$LOCK/pid"
start=$SECONDS
if (acquire_lock "$LOCK" 1) 2>/dev/null; then fail "a live holder's lock must not be taken"; fi
[ $((SECONDS - start)) -ge 1 ] || fail "acquire_lock should wait before giving up"
kill "$LIVE"
wait "$LIVE" 2>/dev/null || true
rm -rf "$LOCK"
pass "acquire_lock/release_lock: mutual exclusion, dead-holder reclaim, bounded wait"

SINK="$TEST_ROOT/alerts.txt"
printf '#!/usr/bin/env bash\ncat >>"%s"\n' "$SINK" >"$TEST_ROOT/sink.sh"
chmod +x "$TEST_ROOT/sink.sh"
(
    export ALERT_COMMAND="$TEST_ROOT/sink.sh" LOG_CORRELATION_ID=lib-test
    alert recovery outcome=exhausted
    alert recovery outcome=exhausted
) 2>/dev/null
assert_eq "$(count_matches "$SINK" "")" 1 "alert must fire once per process"
assert_contains "$SINK" "level=alert op=recovery corr=lib-test outcome=exhausted"
pass "alert: deduplicated per process and delivered to ALERT_COMMAND"

printf '#!/usr/bin/env bash\nexit 7\n' >"$TEST_ROOT/failing-sink.sh"
chmod +x "$TEST_ROOT/failing-sink.sh"
out="$(ALERT_COMMAND="$TEST_ROOT/failing-sink.sh" bash -c 'source "$1"; alert recovery outcome=exhausted; echo "alert returned $?"' _ "$REPO_ROOT/lib/reliability.sh" 2>&1)"
assert_text_contains "$out" "outcome=delivery_failed"
assert_text_contains "$out" "alert returned 0"
pass "alert: delivery failure is logged and does not mask the original error"

out="$(LOG_CORRELATION_ID=lib-test bash -c 'source "$1"; on_abort 7 42 sync' _ "$REPO_ROOT/lib/reliability.sh" 2>&1)"
assert_text_contains "$out" "level=error op=sync corr=lib-test outcome=aborted status=7 line=42"
assert_text_contains "$out" "level=alert op=sync corr=lib-test outcome=aborted status=7 line=42"
pass "on_abort: records the abort location and alerts"

if command -v timeout >/dev/null 2>&1; then
    rc=0
    run_bounded 1 sleep 5 || rc=$?
    assert_eq "$rc" 124 "run_bounded must stop a command that exceeds its limit"
fi
run_bounded 5 true
pass "run_bounded: hard timeout when GNU timeout is available"

echo "PASS: reliability library"
