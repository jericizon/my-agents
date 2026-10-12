#!/usr/bin/env bash
set -euo pipefail

TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEST_ROOT"' EXIT

REPO_ROOT="/home/jeric/Workspace/my-agents"
CONTROLLER="$REPO_ROOT/quota-recovery-controller.sh"
PROJECT="$TEST_ROOT/project"
FAKE_BIN="$TEST_ROOT/bin"
FAKE_MARKER="$TEST_ROOT/fake-devin-args"
mkdir -p "$PROJECT" "$FAKE_BIN"

# Fake harness binary so exec never touches a real CLI.
cat >"$FAKE_BIN/devin" <<FAKE
#!/usr/bin/env bash
printf '%s\n' "\$*" >"$FAKE_MARKER"
FAKE
chmod +x "$FAKE_BIN/devin"

fail() {
    echo "FAIL: $*" >&2
    exit 1
}

assert_state_field() {
    local task_id="$1" key="$2" expected="$3"
    local file="$PROJECT/.superpowers/recovery/$task_id.state"
    local actual
    actual="$(grep -m1 "^${key}=" "$file" | cut -d= -f2-)"
    [ "$actual" = "$expected" ] || fail "$task_id: expected $key=$expected, got '$actual'"
}

# 1. record + status roundtrip
"$CONTROLLER" record --harness devin --project "$PROJECT" --task-id t1 \
    --session-id sess-abc --category quota --progress "step 3 done" \
    --interval-seconds 1 >/dev/null
test -f "$PROJECT/.superpowers/recovery/t1.state" || fail "state file missing"
assert_state_field t1 HARNESS devin
assert_state_field t1 CATEGORY quota
assert_state_field t1 STATUS WAITING_FOR_QUOTA
assert_state_field t1 SESSION_ID sess-abc
assert_state_field t1 RETRY_COUNT 0
assert_state_field t1 BASE_INTERVAL 1
"$CONTROLLER" status --project "$PROJECT" --task-id t1 | grep -q "HARNESS=devin" \
    || fail "status output missing HARNESS"

# 2. refused category: recorded as BLOCKED, run refused
"$CONTROLLER" record --harness claude --project "$PROJECT" --task-id t2 \
    --category billing --interval-seconds 1 >/dev/null
assert_state_field t2 STATUS BLOCKED
set +e
"$CONTROLLER" run --project "$PROJECT" --task-id t2 >/dev/null 2>&1
rc=$?
set -e
[ "$rc" -eq 2 ] || fail "run on billing should exit 2, got $rc"

# 3. run prints the verified resume command and increments retries
out="$("$CONTROLLER" run --project "$PROJECT" --task-id t1 --print-command --interval-seconds 1)"
echo "$out" | grep -q "devin -r sess-abc" || fail "resume command not printed: $out"
assert_state_field t1 RETRY_COUNT 1
assert_state_field t1 STATUS READY_TO_RESUME

# 4. bounded retries exhaust without launching anything
set +e
"$CONTROLLER" run --project "$PROJECT" --task-id t1 --max-retries 1 >/dev/null 2>&1
rc=$?
set -e
[ "$rc" -eq 4 ] || fail "exhausted run should exit 4, got $rc"
assert_state_field t1 STATUS EXHAUSTED

# 5. --yes executes the resume command (fake harness proves it ran)
"$CONTROLLER" record --harness devin --project "$PROJECT" --task-id t3 \
    --session-id sess-xyz --category rate_limit --interval-seconds 1 >/dev/null
PATH="$FAKE_BIN:$PATH" "$CONTROLLER" run --project "$PROJECT" --task-id t3 --yes >/dev/null
test -f "$FAKE_MARKER" || fail "fake harness was not executed"
grep -q "sess-xyz" "$FAKE_MARKER" || fail "fake harness did not receive the session id"

# 5b. without --yes, a non-interactive run requires confirmation and launches nothing
"$CONTROLLER" record --harness devin --project "$PROJECT" --task-id t5 \
    --session-id sess-5 --category quota --interval-seconds 1 >/dev/null
rm -f "$FAKE_MARKER"
set +e
PATH="$FAKE_BIN:$PATH" "$CONTROLLER" run --project "$PROJECT" --task-id t5 </dev/null >/dev/null 2>&1
rc=$?
set -e
[ "$rc" -eq 5 ] || fail "non-interactive run without --yes should exit 5, got $rc"
test ! -f "$FAKE_MARKER" || fail "session launched without confirmation"

# 6. unknown harness is refused, nothing invented
set +e
"$CONTROLLER" record --harness unknowncli --project "$PROJECT" --task-id t4 \
    --category quota >/dev/null 2>&1
rc=$?
set -e
[ "$rc" -eq 1 ] || fail "unknown harness should exit 1, got $rc"

# 7. resolve records the final outcome
"$CONTROLLER" resolve --project "$PROJECT" --task-id t1 --outcome manual >/dev/null
assert_state_field t1 OUTCOME manual
assert_state_field t1 STATUS RESOLVED

echo "PASS: quota-recovery-controller"
