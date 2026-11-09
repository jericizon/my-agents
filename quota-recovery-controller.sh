#!/usr/bin/env bash
#
# quota-recovery-controller.sh — recovery controller for the Universal AI Coding
# Agent Policy v2.0 (Section 12). Records usage-limit failures per task, waits
# with bounded retries, and resumes sessions only through verified harness
# mechanisms and only with explicit confirmation.
#
# State: <project shared dir>/.superpowers/recovery/<task-id>.state  (KEY=value lines)
# History: <task-id>.log beside it (append-only events; never progress text or session IDs)
# Exit codes: 0 ok | 1 usage | 2 unsupported/blocked | 3 duplicate suspected
#             4 retries exhausted | 5 confirmation required

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/reliability.sh"
trap 'on_abort $? $LINENO recovery' ERR

BASE_INTERVAL_SECONDS=300
MAX_INTERVAL_SECONDS=3600
DEFAULT_MAX_RETRIES=8
LOCK_WAIT_SECONDS=5
STATE_KEYS="HARNESS PROJECT_DIR TASK_ID SESSION_ID CHECKPOINT_PATH CATEGORY LAST_PROGRESS RETRY_COUNT MAX_RETRIES BASE_INTERVAL NEXT_RETRY_EPOCH STATUS OUTCOME CREATED_EPOCH UPDATED_EPOCH ALERTED"

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

# Projects inside the workspace root write artifacts under
# <workspace>/_shared/<project-relpath>/; outside it they stay in-repo.
# Convention: see shared/rules/global_rules.md — "Shared Workspace Artifacts".
shared_project_dir() {
    local project root
    project="$(cd "$1" 2>/dev/null && pwd -P)" || project="$1"

    if [ -d "$HOME/Workspace" ]; then
        root="$HOME/Workspace"
    elif [ -d "$HOME/workspace" ]; then
        root="$HOME/workspace"
    else
        printf '%s' "$project"
        return
    fi
    root="$(cd "$root" && pwd -P)"

    case "$project" in
        "$root/_shared"|"$root/_shared"/*) printf '%s' "$project" ;;
        "$root"/*) printf '%s/_shared/%s' "$root" "${project#"$root"/}" ;;
        *) printf '%s' "$project" ;;
    esac
}

state_path() {
    local project="$1"
    local task_id="$2"
    printf '%s/.superpowers/recovery/%s.state' "$(shared_project_dir "$project")" "$task_id"
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

# load_state <file>: sets the state globals; empty when the file is absent.
load_state() {
    local file="$1" key
    for key in $STATE_KEYS; do
        printf -v "$key" '%s' "$(state_get "$file" "$key")"
    done
}

# write_state <file>: replaces the whole record with one rename, so readers never see a partial file.
write_state() {
    local file="$1" key
    : >"$file.tmp"
    for key in $STATE_KEYS; do
        printf '%s=%s\n' "$key" "${!key}" >>"$file.tmp"
    done
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

# This process and its parents, space-separated.
ancestor_pids() {
    local pid=$$ parent
    while [ "$pid" -gt 1 ]; do
        printf ' %s' "$pid"
        parent="$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')" || break
        [ -n "$parent" ] || break
        pid="$parent"
    done
}

# Fails closed: a matching process, a pgrep error, or no pgrep all count as "may be running".
# Ancestors are ignored, since the harness that invoked this controller is the one being recovered.
duplicate_session_running() {
    local harness="$1" session_id="$2" pattern pids pid rc=0
    command -v pgrep >/dev/null 2>&1 || return 0
    pattern="$harness"
    [ -z "$session_id" ] || pattern="${harness}.*${session_id}"
    pids="$(pgrep -f "$pattern" 2>/dev/null)" || rc=$?
    case "$rc" in
        0) ;;
        1) return 1 ;;
        *) return 0 ;;
    esac
    for pid in $pids; do
        case "$(ancestor_pids) " in
            *" $pid "*) ;;
            *) return 0 ;;
        esac
    done
    return 1
}

lock_task() { acquire_lock "$1.lock" "$LOCK_WAIT_SECONDS" || die "another recovery operation holds $1.lock"; }
unlock_task() { release_lock "$1.lock"; }

# notify_once <alert key=value...>: one alert per failure event. The caller persists ALERTED.
notify_once() {
    [ "$ALERTED" != 1 ] || return 0
    alert recovery "$@"
    ALERTED=1
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
    require_int --max-retries "$max_retries" 1
    require_int --interval-seconds "$interval" 1

    local file now status
    file="$(state_path "$project" "$task_id")"
    mkdir -p "$(dirname "$file")"
    LOG_CORRELATION_ID="$task_id"
    LOG_FILE="${file%.state}.log"
    lock_task "$file"
    load_state "$file"

    # Preserve fields not supplied on this record call.
    [ -n "$session_id" ] || session_id="$SESSION_ID"
    [ -n "$checkpoint" ] || checkpoint="$CHECKPOINT_PATH"
    [ -n "$checkpoint" ] || checkpoint="$(shared_project_dir "$project")/.superpowers/CURRENT_TASK.md"

    now="$(date +%s)"
    if is_refused_category "$category"; then
        status="BLOCKED"
    else
        status="WAITING_FOR_QUOTA"
    fi

    HARNESS="$harness"
    PROJECT_DIR="$project"
    TASK_ID="$task_id"
    SESSION_ID="$(sanitize "$session_id")"
    CHECKPOINT_PATH="$(sanitize "$checkpoint")"
    CATEGORY="$category"
    LAST_PROGRESS="$(sanitize "$progress")"
    RETRY_COUNT=0
    MAX_RETRIES="$max_retries"
    BASE_INTERVAL="$interval"
    NEXT_RETRY_EPOCH=$((now + interval))
    STATUS="$status"
    OUTCOME=""
    CREATED_EPOCH="$now"
    UPDATED_EPOCH="$now"
    ALERTED=""
    if [ "$status" = "BLOCKED" ]; then
        notify_once category="$category" outcome=blocked
    fi
    write_state "$file"
    unlock_task "$file"
    log_event info record outcome=recorded category="$category" status="$status"

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
    local max_retries_cli="" interval_cli=""
    while [ "$#" -gt 0 ]; do
        case "$1" in
            --project) project="$2"; shift 2 ;;
            --task-id) task_id="$2"; shift 2 ;;
            --yes) assume_yes=1; shift ;;
            --print-command) print_command=1; shift ;;
            --max-retries) max_retries_cli="$2"; shift 2 ;;
            --interval-seconds) interval_cli="$2"; shift 2 ;;
            *) die "run: unknown argument $1" ;;
        esac
    done
    [ -n "$project" ] || die "run: --project is required"
    [ -n "$task_id" ] || die "run: --task-id is required"
    validate_task_id "$task_id"
    [ -z "$max_retries_cli" ] || require_int --max-retries "$max_retries_cli" 1
    [ -z "$interval_cli" ] || require_int --interval-seconds "$interval_cli" 1

    local file
    file="$(state_path "$project" "$task_id")"
    [ -f "$file" ] || die "no recovery state for task $task_id; run record first"
    LOG_CORRELATION_ID="$task_id"
    LOG_FILE="${file%.state}.log"
    load_state "$file"
    require_int "RETRY_COUNT in state" "$RETRY_COUNT" 0
    require_int "NEXT_RETRY_EPOCH in state" "$NEXT_RETRY_EPOCH" 0
    [ -z "$max_retries_cli" ] || MAX_RETRIES="$max_retries_cli"
    [ -z "$interval_cli" ] || BASE_INTERVAL="$interval_cli"
    MAX_RETRIES="${MAX_RETRIES:-$DEFAULT_MAX_RETRIES}"
    BASE_INTERVAL="${BASE_INTERVAL:-$BASE_INTERVAL_SECONDS}"
    require_int "MAX_RETRIES in state" "$MAX_RETRIES" 1
    require_int "BASE_INTERVAL in state" "$BASE_INTERVAL" 1

    if [ -n "$OUTCOME" ]; then
        echo "Task $task_id already resolved (outcome: $OUTCOME). Nothing to do."
        return 0
    fi

    if is_refused_category "$CATEGORY"; then
        echo "Category '$CATEGORY' requires human action (account, billing, or permissions)."
        echo "The controller will not retry it. Resolve the underlying issue, then record a new event."
        exit 2
    fi

    validate_harness "$HARNESS"

    if ! command -v "$HARNESS" >/dev/null 2>&1; then
        lock_task "$file"
        load_state "$file"
        STATUS="BLOCKED"
        notify_once category="$CATEGORY" outcome=blocked reason=harness_missing
        write_state "$file"
        unlock_task "$file"
        echo "Harness CLI '$HARNESS' is not installed. No supported recovery path exists."
        echo "Checkpoint preserved at: $CHECKPOINT_PATH"
        exit 2
    fi

    if [ "$RETRY_COUNT" -ge "$MAX_RETRIES" ]; then
        lock_task "$file"
        load_state "$file"
        STATUS="EXHAUSTED"
        notify_once category="$CATEGORY" outcome=exhausted attempts="$RETRY_COUNT/$MAX_RETRIES"
        write_state "$file"
        unlock_task "$file"
        echo "Retry budget exhausted ($RETRY_COUNT/$MAX_RETRIES attempts)."
        echo "Preserve the checkpoint and resume manually, or record a new failure event."
        exit 4
    fi

    local seen_retry="$RETRY_COUNT" now wait_seconds delay
    now="$(date +%s)"
    wait_seconds=$((NEXT_RETRY_EPOCH - now))
    if [ "$wait_seconds" -gt 0 ]; then
        echo "Waiting $wait_seconds seconds until the next eligible retry..."
        sleep "$wait_seconds"
    fi

    local cmd_parts
    IFS=' ' read -ra cmd_parts <<<"$(resume_command "$HARNESS" "$SESSION_ID")"

    echo "Retry $((seen_retry + 1))/$MAX_RETRIES eligible. Resume command:"
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
        read -r -p "Execute it now? [y/N] " answer || answer=""
        case "$answer" in
            y|Y|yes|YES) ;;
            *) echo "Not executing. Run the command above when ready." ; exit 5 ;;
        esac
    fi

    if duplicate_session_running "$HARNESS" "$SESSION_ID"; then
        echo "A $HARNESS process matching this session appears to be running, or could not be checked."
        echo "Refusing to restart work that may still be running concurrently."
        log_event warn recovery outcome=refused reason=duplicate_suspected attempt="$((seen_retry + 1))"
        exit 3
    fi

    # Claim the retry under the lock; a concurrent claim changes RETRY_COUNT and this run stops.
    lock_task "$file"
    load_state "$file"
    if [ "$RETRY_COUNT" != "$seen_retry" ] || [ -n "$OUTCOME" ]; then
        unlock_task "$file"
        echo "Recovery state changed while waiting; another controller may have claimed this retry. Check status before retrying."
        log_event warn recovery outcome=refused reason=state_changed
        exit 3
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    now="$(date +%s)"
    delay="$(backoff_seconds "$RETRY_COUNT" "$BASE_INTERVAL" "$MAX_INTERVAL_SECONDS")"
    NEXT_RETRY_EPOCH=$((now + delay))
    STATUS="READY_TO_RESUME"
    UPDATED_EPOCH="$now"
    write_state "$file"
    unlock_task "$file"
    log_event info recovery outcome=launching category="$CATEGORY" attempt="$RETRY_COUNT" max="$MAX_RETRIES" harness="$HARNESS"

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
    LOG_CORRELATION_ID="$task_id"
    LOG_FILE="${file%.state}.log"
    lock_task "$file"
    load_state "$file"
    if [ -n "$OUTCOME" ] && [ "$OUTCOME" != "$outcome" ]; then
        unlock_task "$file"
        die "task $task_id already resolved with outcome $OUTCOME"
    fi
    OUTCOME="$outcome"
    STATUS="RESOLVED"
    UPDATED_EPOCH="$(date +%s)"
    write_state "$file"
    unlock_task "$file"
    log_event info resolve outcome="$outcome"
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
