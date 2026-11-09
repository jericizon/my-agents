#!/usr/bin/env bash
# Shared reliability helpers for sync-agents.sh and quota-recovery-controller.sh.
# Sourced only: defines functions and has no side effects.

# event_line <level> <op> [key=value ...]: one structured line. Values must not contain spaces.
event_line() {
    local level="$1" op="$2"
    shift 2
    printf 'ts=%s level=%s op=%s corr=%s' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$level" "$op" "${LOG_CORRELATION_ID:-none}"
    [ "$#" -eq 0 ] || printf ' %s' "$*"
    printf '\n'
}

# log_event <level> <op> [key=value ...]: to $LOG_FILE when set; to stderr unless it is an info event in a file-logged run.
log_event() {
    local level="$1" line
    line="$(event_line "$@")"
    if [ -z "${LOG_FILE:-}" ] || [ "$level" != info ]; then printf '%s\n' "$line" >&2; fi
    [ -z "${LOG_FILE:-}" ] || printf '%s\n' "$line" >>"$LOG_FILE"
}

# require_int <label> <value> <min>: exits 1 unless value is an integer >= min (at most 12 digits, no overflow).
require_int() {
    if ! [[ "$2" =~ ^[0-9]{1,12}$ ]] || [ "$2" -lt "$3" ]; then
        echo "ERROR: $1 must be an integer >= $3: $2" >&2
        exit 1
    fi
}

# backoff_seconds <attempt> <base> <cap>: base*2^(attempt-1) capped at cap, with equal jitter in [delay/2, delay].
backoff_seconds() {
    local attempt="$1" base="$2" cap="$3" delay="$2" i half
    for ((i = 1; i < attempt && delay > 0 && delay < cap; i++)); do delay=$((delay * 2)); done
    [ "$delay" -le "$cap" ] || delay="$cap"
    half=$((delay / 2))
    printf '%s\n' $((half + RANDOM % (half + 1)))
}

# acquire_lock <dir> [wait_seconds]: atomic mkdir lock, released on exit. Reclaims a lock whose owner PID is gone.
# shortcut: reclaim is check-then-remove and can race; a crash between mkdir and the PID write leaves an ownerless lock to delete by hand. Upgrade to flock(1) if runs can overlap across hosts.
acquire_lock() {
    local dir="$1" wait_seconds="${2:-0}" waited=0 owner
    until mkdir "$dir" 2>/dev/null; do
        owner="$(cat "$dir/pid" 2>/dev/null || true)"
        if [ -n "$owner" ] && ! kill -0 "$owner" 2>/dev/null && rm -rf "$dir" 2>/dev/null; then
            continue
        fi
        [ "$waited" -lt "$wait_seconds" ] || return 1
        sleep 1
        waited=$((waited + 1))
    done
    printf '%s\n' "$$" >"$dir/pid" || { rm -rf "$dir"; return 1; }
    LOCK_HELD="$dir"
    trap 'release_lock "$LOCK_HELD"' EXIT
}

# release_lock <dir>: removes the lock only when this process owns it.
release_lock() {
    if [ "$(cat "$1/pid" 2>/dev/null || true)" = "$$" ]; then rm -rf "$1"; fi
}

# run_bounded <seconds> <cmd...>: hard timeout via GNU timeout when installed.
run_bounded() {
    local seconds="$1"
    shift
    if command -v timeout >/dev/null 2>&1; then
        timeout --kill-after=5 "$seconds" "$@"
    else
        log_event warn timeout outcome=hard_timeout_unavailable
        "$@"
    fi
}

# alert <op> [key=value ...]: at most one per process. Writes to stderr and $LOG_FILE, and pipes to $ALERT_COMMAND when set.
alert() {
    [ -z "${ALERT_SENT:-}" ] || return 0
    ALERT_SENT=1
    local line
    line="$(event_line alert "$@")"
    printf '%s\n' "$line" >&2
    [ -z "${LOG_FILE:-}" ] || printf '%s\n' "$line" >>"$LOG_FILE"
    if [ -n "${ALERT_COMMAND:-}" ] && ! printf '%s\n' "$line" | run_bounded 30 "$ALERT_COMMAND"; then
        log_event error alert outcome=delivery_failed
    fi
    return 0
}

# on_abort <status> <line> <op>: ERR-trap boundary. Records where the run stopped; set -e then exits with the status.
on_abort() {
    log_event error "$3" outcome=aborted status="$1" line="$2"
    alert "$3" outcome=aborted status="$1" line="$2"
}
