#!/usr/bin/env bash
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$REPO_ROOT/tests/assert.sh"

TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEST_ROOT"' EXIT
REAL_GIT="$(command -v git)"
WORK="$TEST_ROOT/work"
HOME_DIR="$TEST_ROOT/home"
BIN="$TEST_ROOT/bin"
FAKE_STATE="$TEST_ROOT/fake-git"
SINK="$TEST_ROOT/alerts.txt"
LOG="$TEST_ROOT/sync.log"
SUPER_REMOTE="$TEST_ROOT/remotes/superpowers.git"
UIUX_REMOTE="$TEST_ROOT/remotes/ui-ux-pro-max.git"
LOCK_DIR="$HOME_DIR/.cache/my-agents/sync.lock"
SKILLS="$WORK/superpowers-agents/skills"

mkdir -p "$BIN" "$HOME_DIR" "$FAKE_STATE" "$TEST_ROOT/remotes"

# seed_remote <bare-repo> <skill-dir> <skill-name>: one-commit upstream on main.
seed_remote() {
    local bare="$1" skill_dir="$2" name="$3" seed="$TEST_ROOT/seed-$3"
    git init -q --bare -b main "$bare"
    git init -q -b main "$seed"
    mkdir -p "$seed/$skill_dir"
    printf -- '---\nname: %s\ndescription: fixture\n---\n' "$name" >"$seed/$skill_dir/SKILL.md"
    git -C "$seed" add -A
    git -C "$seed" -c user.name=test -c user.email=test@example.com commit -qm seed
    git -C "$seed" push -q "$bare" main
}
seed_remote "$SUPER_REMOTE" skills/sample-skill sample-skill
seed_remote "$UIUX_REMOTE" .claude/skills/ui-ux-pro-max ui-ux-pro-max

# clone_fork <remote> <dir>: same layout the sync expects (upstream remote name).
clone_fork() {
    git clone -q "$1" "$2"
    git -C "$2" remote rename origin upstream
}

make_repo() {
    rm -rf "$WORK"
    mkdir -p "$WORK/lib" "$WORK/custom/skills/custom-skill" "$WORK/shared/rules" "$WORK/shared/policy" "$WORK/forks"
    cp "$REPO_ROOT/sync-agents.sh" "$WORK/"
    cp "$REPO_ROOT/lib/reliability.sh" "$WORK/lib/"
    printf -- '---\nname: custom-skill\ndescription: fixture v1\n---\n' >"$WORK/custom/skills/custom-skill/SKILL.md"
    echo "# Global rules fixture" >"$WORK/shared/rules/global_rules.md"
    echo "# Policy fixture" >"$WORK/shared/policy/TASK_CONTINUITY.md"
    clone_fork "$SUPER_REMOTE" "$WORK/forks/superpowers-fork"
    clone_fork "$UIUX_REMOTE" "$WORK/forks/ui-ux-fork"
}

# Test double for git: scripted network failures for fetch and clone; everything else passes through.
cat >"$BIN/git" <<'FAKE_GIT'
#!/usr/bin/env bash
args=()
for arg in "$@"; do
    case "$arg" in
        https://github.com/obra/superpowers.git) arg="$FAKE_SUPER_REMOTE" ;;
        https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git) arg="$FAKE_UIUX_REMOTE" ;;
    esac
    args+=("$arg")
done
case " $* " in
    *" fetch "*|*" clone "*)
        calls=$(( $(cat "$FAKE_GIT_STATE/calls" 2>/dev/null || echo 0) + 1 ))
        echo "$calls" >"$FAKE_GIT_STATE/calls"
        case "${FAKE_GIT_MODE:-}" in
            permanent)
                echo "remote: Repository not found." >&2
                echo "fatal: repository 'https://github.com/obra/superpowers.git/' not found" >&2
                exit 128 ;;
            hang) sleep 30 ;;
        esac
        if [ "$calls" -le "${FAKE_GIT_FAIL_COUNT:-0}" ]; then
            if [ "${FAKE_GIT_MODE:-}" = rate_limit ]; then
                echo "fatal: unable to access 'https://github.com/obra/superpowers.git/': The requested URL returned error: 429" >&2
            else
                echo "fatal: unable to access 'https://github.com/obra/superpowers.git/': Could not resolve host: github.com" >&2
            fi
            exit 128
        fi
        ;;
esac
exec "$REAL_GIT" "${args[@]}"
FAKE_GIT
chmod +x "$BIN/git"

cat >"$TEST_ROOT/alert-sink.sh" <<SINK_SCRIPT
#!/usr/bin/env bash
cat >>"$SINK"
SINK_SCRIPT
chmod +x "$TEST_ROOT/alert-sink.sh"

# run_sync <log> [VAR=value ...]: fixture sync in a clean environment, fake git first on PATH.
run_sync() {
    local log="$1"
    shift
    (
        cd "$WORK" && env -i PATH="$BIN:/usr/bin:/bin" HOME="$HOME_DIR" REAL_GIT="$REAL_GIT" \
            FAKE_GIT_STATE="$FAKE_STATE" FAKE_SUPER_REMOTE="$SUPER_REMOTE" FAKE_UIUX_REMOTE="$UIUX_REMOTE" \
            ALERT_COMMAND="$TEST_ROOT/alert-sink.sh" SYNC_BACKOFF_BASE_SECONDS=0 SYNC_LOCK_WAIT_SECONDS=1 \
            "$@" ./sync-agents.sh
    ) >"$log" 2>&1
}

reset_case() {
    rm -rf "$FAKE_STATE" "$SINK"
    mkdir -p "$FAKE_STATE"
}

calls() { cat "$FAKE_STATE/calls" 2>/dev/null || echo 0; }

make_repo

# 1. Happy path, then an idempotent re-run that leaves the generated tree unchanged.
reset_case
rc=0
run_sync "$LOG" || rc=$?
assert_eq "$rc" 0 "happy-path sync should succeed"
assert_contains "$LOG" "Done."
test -f "$SKILLS/sample-skill/SKILL.md" || fail "upstream skill not generated"
test -f "$SKILLS/ui-ux-pro-max/SKILL.md" || fail "allowlisted ui-ux skill missing"
test -f "$SKILLS/custom-skill/SKILL.md" || fail "custom skill missing"
assert_eq "$(readlink "$HOME_DIR/.agents")" "$WORK/superpowers-agents"
rm -rf "$TEST_ROOT/snapshot"
cp -R "$SKILLS" "$TEST_ROOT/snapshot"
rc=0
run_sync "$LOG" || rc=$?
assert_eq "$rc" 0 "re-run should succeed"
diff -r "$SKILLS" "$TEST_ROOT/snapshot" >/dev/null || fail "re-run changed the generated tree"
assert_eq "$(count_matches "$SINK" "")" 0 "a successful sync must not alert"
pass "happy path and idempotent re-run"

# 2. Transient fetch failures are retried and recovered.
reset_case
rc=0
run_sync "$LOG" FAKE_GIT_FAIL_COUNT=2 || rc=$?
assert_eq "$rc" 0 "two transient failures should be recovered"
assert_eq "$(count_matches "$LOG" "category=transient")" 2
assert_contains "$LOG" "outcome=recovered attempts=3"
assert_eq "$(count_matches "$SINK" "")" 0 "recovered failures must not alert"
pass "transient failures retried and recovered"

# 2b. HTTP 429 from the server is a transient, retryable failure.
reset_case
rc=0
run_sync "$LOG" FAKE_GIT_MODE=rate_limit FAKE_GIT_FAIL_COUNT=2 || rc=$?
assert_eq "$rc" 0 "rate-limited fetches should be retried until they succeed"
assert_eq "$(count_matches "$LOG" "category=transient")" 2
assert_contains "$LOG" "outcome=recovered attempts=3"
pass "HTTP 429 treated as transient and retried"

# 3. Permanent failures are not retried, abort loudly, alert once, and keep the previous tree.
reset_case
rc=0
run_sync "$LOG" FAKE_GIT_MODE=permanent || rc=$?
[ "$rc" -ne 0 ] || fail "permanent failure must fail the sync"
assert_eq "$(calls)" 1 "permanent failure must not be retried"
assert_contains "$LOG" "category=permanent"
assert_contains "$LOG" "outcome=aborted"
assert_eq "$(count_matches "$SINK" "")" 1 "an aborted sync alerts exactly once"
test -f "$SKILLS/sample-skill/SKILL.md" || fail "previous generated tree must survive a failed sync"
pass "permanent failure not retried; previous tree preserved"

# 4. Exhausted retries stop at the attempt limit and alert once.
reset_case
rc=0
run_sync "$LOG" FAKE_GIT_FAIL_COUNT=99 SYNC_MAX_ATTEMPTS=3 || rc=$?
[ "$rc" -ne 0 ] || fail "exhausted retries must fail the sync"
assert_eq "$(calls)" 3 "attempts must stop at SYNC_MAX_ATTEMPTS"
assert_contains "$LOG" "category=exhausted attempts=3"
assert_eq "$(count_matches "$SINK" "")" 1 "exhaustion alerts exactly once"
pass "exhausted retries bounded and alerted once"

# 5. A stalled attempt is cut off by the attempt timeout and treated as transient.
if ! command -v timeout >/dev/null 2>&1; then
    echo "SKIP: attempt-timeout scenario needs GNU timeout"
else
    reset_case
    start=$SECONDS
    rc=0
    run_sync "$LOG" FAKE_GIT_MODE=hang SYNC_ATTEMPT_TIMEOUT_SECONDS=1 SYNC_MAX_ATTEMPTS=2 || rc=$?
    [ "$rc" -ne 0 ] || fail "timed-out fetches must fail the sync"
    assert_eq "$(calls)" 2 "timed-out attempts must be retried up to the limit"
    assert_contains "$LOG" "status=124"
    [ $((SECONDS - start)) -lt 30 ] || fail "timeouts did not bound the run"
    pass "attempt timeout enforced and retried"
fi

# 6. The overall deadline stops retries even when attempts remain.
reset_case
rc=0
run_sync "$LOG" FAKE_GIT_FAIL_COUNT=99 SYNC_DEADLINE_SECONDS=0 SYNC_BACKOFF_BASE_SECONDS=2 || rc=$?
[ "$rc" -ne 0 ] || fail "deadline exhaustion must fail the sync"
assert_eq "$(calls)" 1 "no retry may start after the deadline"
assert_contains "$LOG" "category=exhausted attempts=1"
pass "overall deadline honored"

# 7. First-run clone recovers from a transient failure.
reset_case
rm -rf "$WORK/forks/superpowers-fork" "$WORK/forks/ui-ux-fork"
rc=0
run_sync "$LOG" FAKE_GIT_FAIL_COUNT=1 || rc=$?
assert_eq "$rc" 0 "clone should recover from one transient failure"
test -d "$WORK/forks/superpowers-fork/.git" || fail "mirror was not cloned"
assert_contains "$LOG" "outcome=recovered attempts=2"
pass "transient clone failure recovered"

# 8. A concurrent sync holding the lock is refused before any network call.
reset_case
sleep 300 &
LIVE=$!
mkdir -p "$LOCK_DIR"
echo "$LIVE" >"$LOCK_DIR/pid"
rc=0
run_sync "$LOG" || rc=$?
kill "$LIVE"
wait "$LIVE" 2>/dev/null || true
rm -rf "$LOCK_DIR"
[ "$rc" -ne 0 ] || fail "sync must refuse to run while another sync holds the lock"
assert_contains "$LOG" "another sync is running"
assert_eq "$(calls)" 0 "no network call may happen while locked out"
pass "concurrent sync refused by lock"

# 9. A lock left by a dead process is reclaimed and released on exit.
reset_case
bash -c 'exit 0' &
DEAD=$!
wait "$DEAD"
mkdir -p "$LOCK_DIR"
echo "$DEAD" >"$LOCK_DIR/pid"
rc=0
run_sync "$LOG" || rc=$?
assert_eq "$rc" 0 "a dead holder's lock must be reclaimed"
test ! -e "$LOCK_DIR" || fail "lock must be released after sync"
pass "stale lock reclaimed"

# 10. A failed rebuild keeps the previous generated tree; the next good run applies the change.
if [ "$(id -u)" -eq 0 ]; then
    echo "SKIP: rebuild rollback check needs a non-root user"
else
    reset_case
    printf -- '---\nname: custom-skill\ndescription: fixture v2\n---\n' >"$WORK/custom/skills/custom-skill/SKILL.md"
    chmod 000 "$WORK/custom/skills/custom-skill/SKILL.md"
    rc=0
    run_sync "$LOG" || rc=$?
    [ "$rc" -ne 0 ] || fail "unreadable custom skill must fail the rebuild"
    assert_contains "$SKILLS/custom-skill/SKILL.md" "fixture v1"
    chmod 644 "$WORK/custom/skills/custom-skill/SKILL.md"
    rc=0
    run_sync "$LOG" || rc=$?
    assert_eq "$rc" 0 "sync should succeed once the skill is readable"
    assert_contains "$SKILLS/custom-skill/SKILL.md" "fixture v2"
    pass "failed rebuild keeps previous tree; next run applies change"
fi

# 11. Unexpected failure aborts with a structured record and one alert.
reset_case
rm -rf "$HOME_DIR/Workspace"
: >"$HOME_DIR/Workspace"
rc=0
run_sync "$LOG" || rc=$?
[ "$rc" -ne 0 ] || fail "unexpected failure must abort the sync"
assert_contains "$LOG" "outcome=aborted"
assert_eq "$(count_matches "$SINK" "")" 1 "unexpected abort alerts once"
rm -rf "$HOME_DIR/Workspace"
pass "unexpected failure recorded and aborted"

# 12. Invalid knobs are rejected before any network call.
reset_case
rc=0
run_sync "$LOG" SYNC_MAX_ATTEMPTS=0 || rc=$?
[ "$rc" -ne 0 ] || fail "SYNC_MAX_ATTEMPTS=0 must be rejected"
assert_contains "$LOG" "SYNC_MAX_ATTEMPTS must be an integer >= 1"
assert_eq "$(calls)" 0 "invalid input must not reach the network"
pass "invalid knob rejected before network use"

echo "PASS: sync-agents reliability"
