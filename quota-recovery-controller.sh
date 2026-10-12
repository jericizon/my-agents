#!/usr/bin/env bash
#
# quota-recovery-controller.sh — recovery controller for the Universal AI Coding
# Agent Policy v2.0 (Section 12). Records usage-limit failures per task, waits
# with bounded retries, and resumes sessions only through verified harness
# mechanisms and only with explicit confirmation.
#
# State: <project>/.superpowers/recovery/<task-id>.state  (KEY=value lines)
# Exit codes: 0 ok | 1 usage | 2 unsupported/blocked | 3 duplicate suspected
#             4 retries exhausted | 5 confirmation required

set -euo pipefail

BASE_INTERVAL_SECONDS=300
MAX_INTERVAL_SECONDS=3600
DEFAULT_MAX_RETRIES=8

# Categories that waiting can never fix; a human must act.
REFUSED_CATEGORIES="auth billing permission"
# Categories where a bounded wait is a valid recovery strategy.
RECOVERABLE_CATEGORIES="rate_limit quota acu_exhausted network session_expired"
KNOWN_HARNESSES="devin codex claude"

usage() {
    cat <<'USAGE'
Usage:
  quota-recovery-controller.sh record --harness H --project DIR --task-id ID
      --category C [--session-id S] [--checkpoint PATH] [--progress TEXT]
      [--max-retries N] [--interval-seconds N]
  quota-recovery-controller.sh status --project DIR --task-id ID
  quota-recovery-controller.sh run --project DIR --task-id ID [--yes]
      [--max-retries N] [--interval-seconds N] [--print-command]
  quota-recovery-controller.sh resolve --project DIR --task-id ID
      --outcome succeeded|failed|abandoned|manual

Harnesses: devin codex claude
Categories: rate_limit quota acu_exhausted network session_expired (recoverable)
            auth billing permission (blocked; human action required)

`record` starts a fresh failure event: retry count resets, next retry is
now + interval (doubling each retry, capped at 3600s). `run` waits until the
next eligible time, then prints (and with --yes, executes) the verified resume
command. Without --yes, execution requires an interactive confirmation.
USAGE
}

die() {
    echo "ERROR: $*" >&2
    exit 1
}

state_path() {
    local project="$1"
    local task_id="$2"
    printf '%s/.superpowers/recovery/%s.state' "$project" "$task_id"
}

# Reads KEY=value lines without sourcing (values are user-supplied text).
state_get() {
    local file="$1"
    local key="$2"
    local value=""
    if [ -f "$file" ]; then
        value="$(grep -m1 "^${key}=" "$file" | cut -d= -f2- || true)"
    fi
    printf '%s' "$value"
}

state_set() {
    local file="$1"
    local key="$2"
    local value="$3"
    touch "$file"
    grep -v "^${key}=" "$file" >"$file.tmp" || true
    printf '%s=%s\n' "$key" "$value" >>"$file.tmp"
    mv "$file.tmp" "$file"
}

sanitize() {
    # State is line-based; collapse newlines so one field stays one line.
    printf '%s' "$1" | tr '\n' ' ' | tr -d '\r'
}

validate_task_id() {
    case "$1" in
        ''|*[!A-Za-z0-9._-]*) die "task-id must contain only [A-Za-z0-9._-]: $1" ;;
    esac
}

validate_category() {
    local category="$1"
    case " $RECOVERABLE_CATEGORIES $REFUSED_CATEGORIES " in
        *" $category "*) return 0 ;;
        *) die "unknown category: $category (known: $RECOVERABLE_CATEGORIES $REFUSED_CATEGORIES)" ;;
    esac
}

validate_harness() {
    case " $KNOWN_HARNESSES " in
        *" $1 "*) return 0 ;;
        *) die "unsupported harness: $1 (known: $KNOWN_HARNESSES). No recovery path will be invented; record the limitation and resume manually." ;;
    esac
}

is_refused_category() {
    case " $REFUSED_CATEGORIES " in
        *" $1 "*) return 0 ;;
        *) return 1 ;;
    esac
}

resume_command() {
    # Prints the verified resume command for the harness/session (2026-10-13).
    local harness="$1"
    local session_id="$2"
    case "$harness" in
        devin)
            if [ -n "$session_id" ]; then printf 'devin -r %s' "$session_id"; else printf 'devin -c'; fi
            ;;
        codex)
            if [ -n "$session_id" ]; then printf 'codex resume %s' "$session_id"; else printf 'codex resume --last'; fi
            ;;
        claude)
            if [ -n "$session_id" ]; then printf 'claude --resume %s' "$session_id"; else printf 'claude --continue'; fi
            ;;
    esac
}

duplicate_session_running() {
    # Best-effort: the harmful duplicate is resuming the SAME session again.
    command -v pgrep >/dev/null 2>&1 || return 1
    local harness="$1"
    local session_id="$2"
    local pattern
    if [ -n "$session_id" ]; then
        pattern="${harness}.*${session_id}"
    else
        pattern="${harness}"
    fi
    pgrep -f "$pattern" >/dev/null 2>&1
}

cmd_record() {
    local harness="" project="" task_id="" category=""
    local session_id="" checkpoint="" progress="" max_retries="$DEFAULT_MAX_RETRIES"
    local interval="$BASE_INTERVAL_SECONDS"

    while [ "$#" -gt 0 ]; do
        case "$1" in
            --harness) harness="$2"; shift 2 ;;
            --project) project="$2"; shift 2 ;;
            --task-id) task_id="$2"; shift 2 ;;
            --category) category="$2"; shift 2 ;;
            --session-id) session_id="$2"; shift 2 ;;
            --checkpoint) checkpoint="$2"; shift 2 ;;
            --progress) progress="$2"; shift 2 ;;
            --max-retries) max_retries="$2"; shift 2 ;;
            --interval-seconds) interval="$2"; shift 2 ;;
            *) die "record: unknown argument $1" ;;
        esac
    done

    [ -n "$harness" ] || die "record: --harness is required"
    [ -n "$project" ] || die "record: --project is required"
    [ -n "$task_id" ] || die "record: --task-id is required"
    [ -n "$category" ] || die "record: --category is required"
    validate_harness "$harness"
    validate_task_id "$task_id"
    validate_category "$category"
    [ -d "$project" ] || die "project directory does not exist: $project"

    local file
    file="$(state_path "$project" "$task_id")"
    mkdir -p "$(dirname "$file")"

    # Preserve fields not supplied on this record call.
    [ -n "$session_id" ] || session_id="$(state_get "$file" SESSION_ID)"
    [ -n "$checkpoint" ] || checkpoint="$(state_get "$file" CHECKPOINT_PATH)"
    [ -n "$checkpoint" ] || checkpoint="$project/.superpowers/CURRENT_TASK.md"

    local now status
    now="$(date +%s)"
    if is_refused_category "$category"; then
        status="BLOCKED"
    else
        status="WAITING_FOR_QUOTA"
    fi

    {
        printf 'HARNESS=%s\n' "$harness"
        printf 'PROJECT_DIR=%s\n' "$project"
        printf 'TASK_ID=%s\n' "$task_id"
        printf 'SESSION_ID=%s\n' "$(sanitize "$session_id")"
        printf 'CHECKPOINT_PATH=%s\n' "$checkpoint"
        printf 'CATEGORY=%s\n' "$category"
        printf 'LAST_PROGRESS=%s\n' "$(sanitize "$progress")"
        printf 'RETRY_COUNT=0\n'
        printf 'MAX_RETRIES=%s\n' "$max_retries"
        printf 'BASE_INTERVAL=%s\n' "$interval"
        printf 'NEXT_RETRY_EPOCH=%s\n' "$((now + interval))"
        printf 'STATUS=%s\n' "$status"
        printf 'OUTCOME=\n'
        printf 'CREATED_EPOCH=%s\n' "$now"
        printf 'UPDATED_EPOCH=%s\n' "$now"
    } >"$file"

    echo "Recorded failure event for task $task_id ($harness, $category)."
    echo "State: $file"
    if [ "$status" = "BLOCKED" ]; then
        echo "Category '$category' cannot be fixed by waiting. A human must resolve it; run is refused."
    else
        echo "Next eligible retry: $(date -d "@$((now + interval))" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo "epoch $((now + interval))")"
    fi
}

cmd_status() {
    local project="" task_id=""
    while [ "$#" -gt 0 ]; do
        case "$1" in
            --project) project="$2"; shift 2 ;;
            --task-id) task_id="$2"; shift 2 ;;
            *) die "status: unknown argument $1" ;;
        esac
    done
    [ -n "$project" ] || die "status: --project is required"
    [ -n "$task_id" ] || die "status: --task-id is required"
    validate_task_id "$task_id"

    local file
    file="$(state_path "$project" "$task_id")"
    if [ ! -f "$file" ]; then
        echo "No recovery state for task $task_id in $project"
        return 0
    fi
    cat "$file"
}

cmd_run() {
    local project="" task_id="" assume_yes=0 print_command=0
    local max_retries="" interval=""
    while [ "$#" -gt 0 ]; do
        case "$1" in
            --project) project="$2"; shift 2 ;;
            --task-id) task_id="$2"; shift 2 ;;
            --yes) assume_yes=1; shift ;;
            --print-command) print_command=1; shift ;;
            --max-retries) max_retries="$2"; shift 2 ;;
            --interval-seconds) interval="$2"; shift 2 ;;
            *) die "run: unknown argument $1" ;;
        esac
    done
    [ -n "$project" ] || die "run: --project is required"
    [ -n "$task_id" ] || die "run: --task-id is required"
    validate_task_id "$task_id"

    local file
    file="$(state_path "$project" "$task_id")"
    [ -f "$file" ] || die "no recovery state for task $task_id; run record first"

    local harness category session_id status outcome retry_count
    harness="$(state_get "$file" HARNESS)"
    category="$(state_get "$file" CATEGORY)"
    session_id="$(state_get "$file" SESSION_ID)"
    status="$(state_get "$file" STATUS)"
    outcome="$(state_get "$file" OUTCOME)"
    retry_count="$(state_get "$file" RETRY_COUNT)"
    [ -n "$max_retries" ] || max_retries="$(state_get "$file" MAX_RETRIES)"
    [ -n "$max_retries" ] || max_retries="$DEFAULT_MAX_RETRIES"

    if [ -n "$outcome" ]; then
        echo "Task $task_id already resolved (outcome: $outcome). Nothing to do."
        return 0
    fi

    if is_refused_category "$category"; then
        echo "Category '$category' requires human action (account, billing, or permissions)."
        echo "The controller will not retry it. Resolve the underlying issue, then record a new event."
        exit 2
    fi

    validate_harness "$harness"

    if ! command -v "$harness" >/dev/null 2>&1; then
        state_set "$file" STATUS "BLOCKED"
        echo "Harness CLI '$harness' is not installed. No supported recovery path exists."
        echo "Checkpoint preserved at: $(state_get "$file" CHECKPOINT_PATH)"
        exit 2
    fi

    if duplicate_session_running "$harness" "$session_id"; then
        echo "A $harness process matching this session appears to be running."
        echo "Refusing to restart work that may still be running concurrently."
        exit 3
    fi

    local next_retry interval_now
    interval_now="${interval:-$(state_get "$file" BASE_INTERVAL)}"
    [ -n "$interval_now" ] || interval_now="$BASE_INTERVAL_SECONDS"

    if [ "$retry_count" -ge "$max_retries" ]; then
        state_set "$file" STATUS "EXHAUSTED"
        echo "Retry budget exhausted ($retry_count/$max_retries attempts)."
        echo "Preserve the checkpoint and resume manually, or record a new failure event."
        exit 4
    fi

    next_retry="$(state_get "$file" NEXT_RETRY_EPOCH)"
    local now wait_seconds
    now="$(date +%s)"
    wait_seconds=$((next_retry - now))
    if [ "$wait_seconds" -gt 0 ]; then
        echo "Waiting $wait_seconds seconds until the next eligible retry..."
        sleep "$wait_seconds"
    fi

    retry_count=$((retry_count + 1))
    local backoff=$((interval_now * (2 ** (retry_count - 1))))
    [ "$backoff" -le "$MAX_INTERVAL_SECONDS" ] || backoff="$MAX_INTERVAL_SECONDS"
    now="$(date +%s)"
    state_set "$file" RETRY_COUNT "$retry_count"
    state_set "$file" NEXT_RETRY_EPOCH "$((now + backoff))"
    state_set "$file" BASE_INTERVAL "$interval_now"
    state_set "$file" STATUS "READY_TO_RESUME"
    state_set "$file" UPDATED_EPOCH "$now"

    local cmd_parts
    IFS=' ' read -ra cmd_parts <<<"$(resume_command "$harness" "$session_id")"

    echo "Retry $retry_count/$max_retries eligible. Resume command:"
    echo "  ${cmd_parts[*]}"
    if [ "$print_command" -eq 1 ]; then
        return 0
    fi

    if [ "$assume_yes" -ne 1 ]; then
        if [ ! -t 0 ]; then
            echo "Non-interactive session: pass --yes to execute, or run the command above manually."
            exit 5
        fi
        local answer
        read -r -p "Execute it now? [y/N] " answer
        case "$answer" in
            y|Y|yes|YES) ;;
            *) echo "Not executing. Run the command above when ready." ; exit 5 ;;
        esac
    fi

    echo "Launching: ${cmd_parts[*]}"
    echo "After the session ends, inspect the repository and run: $0 resolve --project '$project' --task-id '$task_id' --outcome succeeded|failed|abandoned|manual"
    exec "${cmd_parts[@]}"
}

cmd_resolve() {
    local project="" task_id="" outcome=""
    while [ "$#" -gt 0 ]; do
        case "$1" in
            --project) project="$2"; shift 2 ;;
            --task-id) task_id="$2"; shift 2 ;;
            --outcome) outcome="$2"; shift 2 ;;
            *) die "resolve: unknown argument $1" ;;
        esac
    done
    [ -n "$project" ] || die "resolve: --project is required"
    [ -n "$task_id" ] || die "resolve: --task-id is required"
    [ -n "$outcome" ] || die "resolve: --outcome is required"
    validate_task_id "$task_id"
    case " succeeded failed abandoned manual " in
        *" $outcome "*) ;;
        *) die "outcome must be one of: succeeded failed abandoned manual" ;;
    esac

    local file
    file="$(state_path "$project" "$task_id")"
    [ -f "$file" ] || die "no recovery state for task $task_id; run record first"

    local now
    now="$(date +%s)"
    state_set "$file" OUTCOME "$outcome"
    state_set "$file" STATUS "RESOLVED"
    state_set "$file" UPDATED_EPOCH "$now"
    echo "Task $task_id resolved with outcome: $outcome"
}

main() {
    [ "$#" -gt 0 ] || { usage; exit 1; }
    local command="$1"
    shift
    case "$command" in
        record) cmd_record "$@" ;;
        status) cmd_status "$@" ;;
        run) cmd_run "$@" ;;
        resolve) cmd_resolve "$@" ;;
        -h|--help|help) usage ;;
        *) usage; exit 1 ;;
    esac
}

main "$@"
