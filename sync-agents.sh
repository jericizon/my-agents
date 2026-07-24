#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORK_DIR="$SCRIPT_DIR/superpowers-fork"
AGENT_SKILLS_FORK_DIR="$SCRIPT_DIR/agent-skills-fork"
UI_UX_FORK_DIR="$SCRIPT_DIR/ui-ux-fork"
SOURCE_DIR="$SCRIPT_DIR/superpowers-agents"
SKILLS_DIR="$SOURCE_DIR/skills"
SOURCE_RULES="$SCRIPT_DIR/shared/rules/global_rules.md"
UPSTREAM_REPO="https://github.com/obra/superpowers.git"
AGENT_SKILLS_UPSTREAM_REPO="https://github.com/addyosmani/agent-skills.git"
UI_UX_UPSTREAM_REPO="https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git"
# That repo ships 7 skills; only the design-intelligence core is imported.
UI_UX_SKILL_ALLOWLIST=("ui-ux-pro-max")
AGENTS_TARGET="$HOME/.agents"
CLAUDE_SKILLS_TARGET="$HOME/.claude/skills"
TIMESTAMP="$(date +%s)"

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
        echo "ERROR: Canonical rules file not found: $SOURCE_RULES"
        exit 1
    fi
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

setup_mirror_repo() {
    local repo_dir="$1"
    local repo_url="$2"
    local label="$3"

    if [ -d "$repo_dir/.git" ]; then
        echo "$label directory already exists."
        return 0
    fi

    echo "Cloning $label repository..."
    git clone --depth 1 "$repo_url" "$repo_dir"
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
    git fetch upstream
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
    local agent_skills_source="$AGENT_SKILLS_FORK_DIR/skills"
    local ui_ux_skills_source="$UI_UX_FORK_DIR/.claude/skills"
    local custom_skills_dir="$SCRIPT_DIR/custom/skills"

    require_skills_source_dir "$superpowers_skills_source" "Superpowers"
    require_skills_source_dir "$agent_skills_source" "agent-skills"
    require_skills_source_dir "$ui_ux_skills_source" "ui-ux-pro-max"

    if [ ! -d "$SKILLS_DIR" ]; then
        echo "Creating superpowers-agents/skills directory..."
        mkdir -p "$SKILLS_DIR"
    fi

    echo "Rebuilding generated skills tree..."
    rm -rf "$SKILLS_DIR"/*
    cp -R "$superpowers_skills_source/." "$SKILLS_DIR/"
    copy_missing_skill_dirs "$agent_skills_source" "$SKILLS_DIR" "agent-skills"
    copy_missing_skill_dirs "$ui_ux_skills_source" "$SKILLS_DIR" "ui-ux-pro-max" "${UI_UX_SKILL_ALLOWLIST[@]}"

    if [ -d "$custom_skills_dir" ] && [ "$(ls -A "$custom_skills_dir")" ]; then
        echo "Copying custom skills..."
        cp -R "$custom_skills_dir/." "$SKILLS_DIR/"
    fi

    echo ""
    echo "Current Superpowers status:"
    git -C "$FORK_DIR" log --oneline -1
    echo "Current agent-skills status:"
    git -C "$AGENT_SKILLS_FORK_DIR" log --oneline -1
    echo "Current ui-ux-pro-max status:"
    git -C "$UI_UX_FORK_DIR" log --oneline -1
}

echo "Running unified agents sync..."
echo ""

ensure_rules_source_exists
setup_mirror_repo "$FORK_DIR" "$UPSTREAM_REPO" "Superpowers"
setup_mirror_repo "$AGENT_SKILLS_FORK_DIR" "$AGENT_SKILLS_UPSTREAM_REPO" "agent-skills"
setup_mirror_repo "$UI_UX_FORK_DIR" "$UI_UX_UPSTREAM_REPO" "ui-ux-pro-max"
refresh_repo "$FORK_DIR" "$UPSTREAM_REPO" "Superpowers"
refresh_repo "$AGENT_SKILLS_FORK_DIR" "$AGENT_SKILLS_UPSTREAM_REPO" "agent-skills"
refresh_repo "$UI_UX_FORK_DIR" "$UI_UX_UPSTREAM_REPO" "ui-ux-pro-max"
rebuild_generated_skills

echo ""
install_runtime_paths

echo ""
install_global_rules

echo ""
echo "Done. Skills and global rules are up to date."
