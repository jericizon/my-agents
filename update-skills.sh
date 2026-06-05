#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORK_DIR="$SCRIPT_DIR/superpowers-fork"
AGENT_SKILLS_FORK_DIR="$SCRIPT_DIR/agent-skills-fork"
SKILLS_DIR="$SCRIPT_DIR/superpowers-agents/skills"
UPSTREAM_REPO="https://github.com/obra/superpowers.git"
AGENT_SKILLS_UPSTREAM_REPO="https://github.com/addyosmani/agent-skills.git"

echo "Updating skills from Superpowers and agent-skills..."

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

require_repo_dir() {
    local repo_dir="$1"
    local label="$2"

    if [ ! -d "$repo_dir/.git" ]; then
        echo "ERROR: $label mirror directory does not exist: $repo_dir"
        echo "Please run ./setup-superpowers-fork.sh first"
        exit 1
    fi
}

refresh_repo() {
    local repo_dir="$1"
    local remote_url="$2"
    local label="$3"

    require_repo_dir "$repo_dir" "$label"

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

copy_missing_skill_dirs() {
    local source_dir="$1"
    local destination_dir="$2"
    local label="$3"
    local skill_dir
    local skill_name
    local destination_skill_dir

    for skill_dir in "$source_dir"/*; do
        [ -d "$skill_dir" ] || continue
        skill_name="$(basename "$skill_dir")"
        destination_skill_dir="$destination_dir/$skill_name"

        if [ -e "$destination_skill_dir" ]; then
            echo "Skipping $label skill '$skill_name' because Superpowers already provides it."
            continue
        fi

        cp -R "$skill_dir" "$destination_skill_dir"
        echo "Imported $label skill '$skill_name'."
    done
}

refresh_repo "$FORK_DIR" "$UPSTREAM_REPO" "Superpowers"
refresh_repo "$AGENT_SKILLS_FORK_DIR" "$AGENT_SKILLS_UPSTREAM_REPO" "agent-skills"

SUPERPOWERS_SKILLS_SOURCE="$FORK_DIR/skills"
AGENT_SKILLS_SOURCE="$AGENT_SKILLS_FORK_DIR/skills"
CUSTOM_SKILLS_DIR="$SCRIPT_DIR/custom/skills"

require_skills_source_dir "$SUPERPOWERS_SKILLS_SOURCE" "Superpowers"
require_skills_source_dir "$AGENT_SKILLS_SOURCE" "agent-skills"

if [ ! -d "$SKILLS_DIR" ]; then
    echo "Creating superpowers-agents/skills directory..."
    mkdir -p "$SKILLS_DIR"
fi

echo "Rebuilding generated skills tree..."
rm -rf "$SKILLS_DIR"/*
cp -R "$SUPERPOWERS_SKILLS_SOURCE/." "$SKILLS_DIR/"
copy_missing_skill_dirs "$AGENT_SKILLS_SOURCE" "$SKILLS_DIR" "agent-skills"

if [ -d "$CUSTOM_SKILLS_DIR" ] && [ "$(ls -A "$CUSTOM_SKILLS_DIR")" ]; then
    echo "Copying custom skills..."
    cp -R "$CUSTOM_SKILLS_DIR/." "$SKILLS_DIR/"
fi

echo ""
echo "✓ Skills updated successfully!"
echo ""
echo "Current Superpowers status:"
git -C "$FORK_DIR" log --oneline -1
echo "Current agent-skills status:"
git -C "$AGENT_SKILLS_FORK_DIR" log --oneline -1

echo ""
echo "Refreshing agent runtime paths..."
"$SCRIPT_DIR/setup-agents.sh"
