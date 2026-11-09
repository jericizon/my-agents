#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORK_DIR="$SCRIPT_DIR/forks/superpowers-fork"
UI_UX_FORK_DIR="$SCRIPT_DIR/forks/ui-ux-fork"
SOURCE_DIR="$SCRIPT_DIR/superpowers-agents"
SKILLS_DIR="$SOURCE_DIR/skills"
SOURCE_RULES="$SCRIPT_DIR/shared/rules/global_rules.md"
SOURCE_POLICY="$SCRIPT_DIR/shared/policy/TASK_CONTINUITY.md"
UPSTREAM_REPO="https://github.com/obra/superpowers.git"
UI_UX_UPSTREAM_REPO="https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git"
# That repo ships 7 skills; only the design-intelligence core is imported.
UI_UX_SKILL_ALLOWLIST=("ui-ux-pro-max")
AGENTS_TARGET="$HOME/.agents"
CLAUDE_SKILLS_TARGET="$HOME/.claude/skills"
CODEX_SKILLS_TARGET="$HOME/.codex/skills"
GEMINI_SKILLS_TARGET="$HOME/.gemini/skills"
WINDSURF_SKILLS_TARGET="$HOME/.codeium/windsurf/skills"
TIMESTAMP="$(date +%s)"
source "$SCRIPT_DIR/lib/reliability.sh"
trap 'on_abort $? $LINENO sync' ERR
LOG_CORRELATION_ID="sync-$TIMESTAMP-$$"
SYNC_MAX_ATTEMPTS="${SYNC_MAX_ATTEMPTS:-3}"
SYNC_ATTEMPT_TIMEOUT_SECONDS="${SYNC_ATTEMPT_TIMEOUT_SECONDS:-180}"
SYNC_DEADLINE_SECONDS="${SYNC_DEADLINE_SECONDS:-600}"
SYNC_BACKOFF_BASE_SECONDS="${SYNC_BACKOFF_BASE_SECONDS:-2}"
SYNC_BACKOFF_CAP_SECONDS=30
SYNC_LOCK_WAIT_SECONDS="${SYNC_LOCK_WAIT_SECONDS:-60}"
SYNC_LOCK_DIR="$HOME/.cache/my-agents/sync.lock"
# Git stderr that marks a network-level failure. Anything else is permanent and not retried.
GIT_TRANSIENT_ERRORS='Could not resolve host|Failed to connect|Connection (timed out|reset|refused|closed)|Operation timed out|Recv failure|RPC failed|early EOF|unexpected disconnect|hung up unexpectedly|transfer closed|requested URL returned error: (429|5[0-9][0-9])|GnuTLS recv error|SSL connect error|Network is unreachable'
require_int SYNC_MAX_ATTEMPTS "$SYNC_MAX_ATTEMPTS" 1
require_int SYNC_ATTEMPT_TIMEOUT_SECONDS "$SYNC_ATTEMPT_TIMEOUT_SECONDS" 1
require_int SYNC_DEADLINE_SECONDS "$SYNC_DEADLINE_SECONDS" 0
require_int SYNC_BACKOFF_BASE_SECONDS "$SYNC_BACKOFF_BASE_SECONDS" 0
require_int SYNC_LOCK_WAIT_SECONDS "$SYNC_LOCK_WAIT_SECONDS" 0

backup_target() {
    local target="$1"
    local backup_path="${target}.backup.${TIMESTAMP}"

    echo "Backing up existing target to:"
    echo "$backup_path"
    mv "$target" "$backup_path"
}

install_symlink() {
    local source="$1"
    local target="$2"

    mkdir -p "$(dirname "$target")"

    if [ -L "$target" ] && [ "$(readlink "$target")" = "$source" ]; then
        echo "Already linked:"
        echo "$target -> $source"
        return 0
    fi

    if [ -e "$target" ] || [ -L "$target" ]; then
        backup_target "$target"
    fi

    ln -s "$source" "$target"
    echo "Symlink created successfully:"
    echo "$target -> $source"
}

install_symlink_or_copy() {
    local source="$1"
    local target="$2"
    local label="$3"

    mkdir -p "$(dirname "$target")"

    if [ -L "$target" ] && [ "$(readlink "$target")" = "$source" ]; then
        echo "Already linked:"
        echo "$target -> $source"
        return 0
    fi

    if [ -e "$target" ] || [ -L "$target" ]; then
        backup_target "$target"
    fi

    if ln -s "$source" "$target"; then
        echo "Symlink created successfully:"
        echo "$target -> $source"
        return 0
    fi

    echo "Symlink failed for $label. Falling back to copy."
    rm -rf "$target"
    mkdir -p "$target"
    cp -R "$source/." "$target/"
    echo "Copied successfully:"
    echo "$target <- $source"
}

ensure_rules_source_exists() {
    if [ ! -f "$SOURCE_RULES" ]; then
        echo "ERROR: Canonical rules file not found: $SOURCE_RULES" >&2
        exit 1
    fi
}

ensure_policy_source_exists() {
    if [ ! -f "$SOURCE_POLICY" ]; then
        echo "ERROR: Canonical policy file not found: $SOURCE_POLICY" >&2
        exit 1
    fi
}

install_policy() {
    local target="$HOME/.config/agent-workflow/TASK_CONTINUITY.md"

    echo "Installing task continuity policy from:"
    echo "  $SOURCE_POLICY"
    echo ""

    install_symlink "$SOURCE_POLICY" "$target"
}

# Links the tracked hooks/ scripts into .git/hooks so `git pull` re-runs this
# sync automatically (post-merge covers normal pulls, post-rewrite --rebase).
install_git_hooks() {
    local hooks_dst="$SCRIPT_DIR/.git/hooks"
    local name target

    # Worktrees/exported copies have no .git dir — nothing to install into.
    [ -d "$hooks_dst" ] || return 0

    echo "Installing git hooks (auto-sync after git pull)..."
    for name in post-merge post-rewrite; do
        target="$hooks_dst/$name"
        if [ -e "$target" ] || [ -L "$target" ]; then
            continue  # already installed or a user-managed hook — leave it
        fi
        ln -s "../../hooks/$name" "$target"
        echo "Linked:"
        echo "  $target -> hooks/$name"
    done
}

# Convention: <workspace>/_shared/<project-relpath> — see shared/rules/global_rules.md.
ensure_shared_workspace() {
    local ws_root

    if [ -d "$HOME/Workspace" ]; then
        ws_root="$HOME/Workspace"
    elif [ -d "$HOME/workspace" ]; then
        ws_root="$HOME/workspace"
    else
        ws_root="$HOME/Workspace"
    fi

    echo "Ensuring shared artifacts directory..."
    mkdir -p "$ws_root/_shared"
    echo "  $ws_root/_shared"
}

install_runtime_paths() {
    echo "Installing agent runtime paths..."

    if [ ! -d "$SOURCE_DIR" ]; then
        echo "ERROR: Source directory does not exist:"
        echo "$SOURCE_DIR"
        exit 1
    fi

    if [ ! -d "$SKILLS_DIR" ]; then
        echo "ERROR: Skills source directory does not exist:"
        echo "$SKILLS_DIR"
        exit 1
    fi

    echo "Syncing Codex runtime path..."
    install_symlink "$SOURCE_DIR" "$AGENTS_TARGET"

    echo ""
    echo "Syncing Claude Code skills path..."
    install_symlink_or_copy "$SKILLS_DIR" "$CLAUDE_SKILLS_TARGET" "Claude Code skills"

    echo ""
    echo "Linking generated skills into Codex, Gemini, and Windsurf skill dirs..."
    link_generated_skills "$CODEX_SKILLS_TARGET"
    link_generated_skills "$GEMINI_SKILLS_TARGET"
    link_generated_skills "$WINDSURF_SKILLS_TARGET"
}

# Codex, Gemini, and Windsurf keep other skill packs in their skills dirs, so
# we link each generated skill individually and drop links whose target was removed.
link_generated_skills() {
    local target_dir="$1"
    local skill_dir
    local skill_name
    local link_path
    local link_dest

    mkdir -p "$target_dir"

    for link_path in "$target_dir"/*; do
        [ -L "$link_path" ] || continue
        link_dest="$(readlink "$link_path")"
        case "$link_dest" in
            "$SKILLS_DIR"/*)
                if [ ! -d "$link_dest" ]; then
                    echo "Removing stale skill link:"
                    echo "  $link_path"
                    rm -f "$link_path"
                fi
                ;;
        esac
    done

    for skill_dir in "$SKILLS_DIR"/*; do
        [ -d "$skill_dir" ] || continue
        skill_name="$(basename "$skill_dir")"
        link_path="$target_dir/$skill_name"

        if [ -L "$link_path" ] && [ "$(readlink "$link_path")" = "$skill_dir" ]; then
            continue
        fi

        if [ -e "$link_path" ] || [ -L "$link_path" ]; then
            # Keep backups outside the skills dir so they aren't scanned as skills.
            local backup_dir="$(dirname "$target_dir")/skills-backup.${TIMESTAMP}"
            mkdir -p "$backup_dir"
            echo "Backing up existing entry:"
            echo "  $link_path -> $backup_dir/$skill_name"
            mv "$link_path" "$backup_dir/$skill_name"
        fi

        ln -s "$skill_dir" "$link_path"
        echo "Linked:"
        echo "  $link_path -> $skill_dir"
    done
}

install_global_rules() {
    local target
    local target_dir
    local backup
    local targets=(
        "$HOME/.codex/AGENTS.md"
        "$HOME/.claude/CLAUDE.md"
        "$HOME/.gemini/GEMINI.md"
        "$HOME/.codeium/windsurf/memories/global_rules.md"
        "$HOME/.antigravity/AGENTS.md"
        "$HOME/.devin/AGENTS.md"
    )

    echo "Installing global rules from:"
    echo "  $SOURCE_RULES"
    echo ""

    for target in "${targets[@]}"; do
        target_dir="$(dirname "$target")"
        mkdir -p "$target_dir"

        if [ -L "$target" ] && [ "$(readlink "$target")" = "$SOURCE_RULES" ]; then
            echo "Already linked: $target"
            continue
        fi

        if [ -e "$target" ] || [ -L "$target" ]; then
            backup="${target}.backup.${TIMESTAMP}"
            echo "Backing up existing file:"
            echo "  $target -> $backup"
            mv "$target" "$backup"
        fi

        ln -s "$SOURCE_RULES" "$target"
        echo "Linked:"
        echo "  $target -> $SOURCE_RULES"
    done
}

ensure_upstream_remote() {
    local remote_url="$1"

    if git remote get-url upstream >/dev/null 2>&1; then
        return
    fi

    if git remote get-url origin >/dev/null 2>&1; then
        remote_url="$(git remote get-url origin)"
    fi

    echo "Remote 'upstream' is missing. Adding: $remote_url"
    git remote add upstream "$remote_url"
}

# Network git calls: hard per-attempt timeout, stall detection, overall deadline; retries only transient failures.
git_network() {
    local op="$1" attempt=1 started rc out delay now
    shift
    started="$(date +%s)"
    while :; do
        rc=0
        out="$(run_bounded "$SYNC_ATTEMPT_TIMEOUT_SECONDS" git -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=60 "$@" 2>&1)" || rc=$?
        if [ "$rc" -eq 0 ]; then
            [ "$attempt" -eq 1 ] || log_event info "$op" outcome=recovered attempts="$attempt"
            return 0
        fi
        if [ "$rc" -ne 124 ] && ! grep -Eqi "$GIT_TRANSIENT_ERRORS" <<<"$out"; then
            log_event error "$op" category=permanent attempts="$attempt" status="$rc"
            printf '%s\n' "$out" >&2
            return "$rc"
        fi
        delay="$(backoff_seconds "$attempt" "$SYNC_BACKOFF_BASE_SECONDS" "$SYNC_BACKOFF_CAP_SECONDS")"
        now="$(date +%s)"
        if [ "$attempt" -ge "$SYNC_MAX_ATTEMPTS" ] || [ $((now + delay - started)) -gt "$SYNC_DEADLINE_SECONDS" ]; then
            log_event error "$op" category=exhausted attempts="$attempt" status="$rc"
            printf '%s\n' "$out" >&2
            return "$rc"
        fi
        log_event warn "$op" category=transient attempt="$attempt" next_in="${delay}s" status="$rc"
        sleep "$delay"
        attempt=$((attempt + 1))
    done
}

setup_mirror_repo() {
    local repo_dir="$1"
    local repo_url="$2"
    local label="$3"

    if [ -d "$repo_dir/.git" ]; then
        echo "$label directory already exists."
        return 0
    fi

    echo "Cloning $label repository..."
    git_network "$label.clone" clone --depth 1 "$repo_url" "$repo_dir"
    git -C "$repo_dir" remote rename origin upstream
}

require_repo_dir() {
    local repo_dir="$1"
    local label="$2"

    if [ ! -d "$repo_dir/.git" ]; then
        echo "ERROR: $label mirror directory does not exist: $repo_dir"
        exit 1
    fi
}

refresh_repo() {
    local repo_dir="$1"
    local remote_url="$2"
    local label="$3"

    require_repo_dir "$repo_dir" "$label"

    echo "Refreshing $label mirror..."
    cd "$repo_dir"
    ensure_upstream_remote "$remote_url"
    echo "Fetching $label upstream..."
    git_network "$label.fetch" fetch upstream
    echo "Resetting $label to latest upstream/main..."
    git reset --hard upstream/main
}

require_skills_source_dir() {
    local source_dir="$1"
    local label="$2"

    if [ ! -d "$source_dir" ]; then
        echo "ERROR: Expected $label skills directory does not exist: $source_dir"
        exit 1
    fi
}

is_allowed_skill() {
    local skill_name="$1"
    shift
    local allowed

    # No allowlist means import everything the source offers.
    [ "$#" -eq 0 ] && return 0

    for allowed in "$@"; do
        [ "$allowed" = "$skill_name" ] && return 0
    done

    return 1
}

# Trailing args, if any, restrict the import to those skill names.
copy_missing_skill_dirs() {
    local source_dir="$1"
    local destination_dir="$2"
    local label="$3"
    shift 3
    local allowlist=("$@")
    local skill_dir
    local skill_name
    local destination_skill_dir

    for skill_dir in "$source_dir"/*; do
        [ -d "$skill_dir" ] || continue
        skill_name="$(basename "$skill_dir")"
        destination_skill_dir="$destination_dir/$skill_name"

        if ! is_allowed_skill "$skill_name" ${allowlist[@]+"${allowlist[@]}"}; then
            continue
        fi

        if [ -e "$destination_skill_dir" ]; then
            echo "Skipping $label skill '$skill_name' because Superpowers already provides it."
            continue
        fi

        cp -R "$skill_dir" "$destination_skill_dir"
        echo "Imported $label skill '$skill_name'."
    done
}

rebuild_generated_skills() {
    local superpowers_skills_source="$FORK_DIR/skills"
    local ui_ux_skills_source="$UI_UX_FORK_DIR/.claude/skills"
    local custom_skills_dir="$SCRIPT_DIR/custom/skills"
    local staging="$SOURCE_DIR/.skills-staging-$$"
    local previous="$SOURCE_DIR/.skills-previous"

    require_skills_source_dir "$superpowers_skills_source" "Superpowers"
    require_skills_source_dir "$ui_ux_skills_source" "ui-ux-pro-max"

    # Leftovers from an interrupted run; the sync lock keeps other runs out.
    mkdir -p "$SOURCE_DIR"
    rm -rf "$SOURCE_DIR"/.skills-staging-* "$previous"

    echo "Rebuilding generated skills tree..."
    mkdir "$staging"
    cp -R "$superpowers_skills_source/." "$staging/"
    copy_missing_skill_dirs "$ui_ux_skills_source" "$staging" "ui-ux-pro-max" "${UI_UX_SKILL_ALLOWLIST[@]}"

    if [ -d "$custom_skills_dir" ] && [ "$(ls -A "$custom_skills_dir")" ]; then
        echo "Copying custom skills..."
        cp -R "$custom_skills_dir/." "$staging/"
    fi

    # Swap in the finished tree only; a failed build leaves the previous tree in place.
    [ ! -d "$SKILLS_DIR" ] || mv "$SKILLS_DIR" "$previous"
    if ! mv "$staging" "$SKILLS_DIR"; then
        [ ! -d "$previous" ] || mv "$previous" "$SKILLS_DIR"
        return 1
    fi
    rm -rf "$previous"

    echo ""
    echo "Current Superpowers status:"
    git -C "$FORK_DIR" log --oneline -1
    echo "Current ui-ux-pro-max status:"
    git -C "$UI_UX_FORK_DIR" log --oneline -1
}

echo "Running unified agents sync..."
echo ""

mkdir -p "$(dirname "$SYNC_LOCK_DIR")"
acquire_lock "$SYNC_LOCK_DIR" "$SYNC_LOCK_WAIT_SECONDS" || { echo "ERROR: another sync is running (lock: $SYNC_LOCK_DIR)" >&2; exit 1; }

ensure_rules_source_exists
ensure_policy_source_exists
setup_mirror_repo "$FORK_DIR" "$UPSTREAM_REPO" "Superpowers"
setup_mirror_repo "$UI_UX_FORK_DIR" "$UI_UX_UPSTREAM_REPO" "ui-ux-pro-max"
refresh_repo "$FORK_DIR" "$UPSTREAM_REPO" "Superpowers"
refresh_repo "$UI_UX_FORK_DIR" "$UI_UX_UPSTREAM_REPO" "ui-ux-pro-max"
rebuild_generated_skills

echo ""
install_runtime_paths

echo ""
install_global_rules

echo ""
install_policy

echo ""
install_git_hooks

echo ""
ensure_shared_workspace

echo ""
echo "Done. Skills, global rules, task continuity policy, and shared workspace are up to date."
log_event info sync outcome=completed
