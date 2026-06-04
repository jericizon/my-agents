#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORK_DIR="$SCRIPT_DIR/superpowers-fork"
SKILLS_DIR="$SCRIPT_DIR/superpowers-agents/skills"
UPSTREAM_REPO="https://github.com/obra/superpowers.git"

echo "Updating skills from obra/superpowers fork..."

# Check if fork directory exists
if [ ! -d "$FORK_DIR" ]; then
    echo "ERROR: Fork directory does not exist: $FORK_DIR"
    echo "Please run ./setup-superpowers-fork.sh first"
    exit 1
fi

cd "$FORK_DIR"

ensure_upstream_remote() {
    if git remote get-url upstream >/dev/null 2>&1; then
        return
    fi

    remote_url="$UPSTREAM_REPO"
    if git remote get-url origin >/dev/null 2>&1; then
        remote_url="$(git remote get-url origin)"
    fi

    echo "Remote 'upstream' is missing. Adding: $remote_url"
    git remote add upstream "$remote_url"
}

ensure_upstream_remote

# Fetch latest from upstream
echo "Fetching upstream..."
git fetch upstream

# Reset to latest upstream/main
echo "Resetting to latest upstream/main..."
git reset --hard upstream/main

# Create superpowers-agents/skills directory if it doesn't exist
if [ ! -d "$SKILLS_DIR" ]; then
    echo "Creating superpowers-agents/skills directory..."
    mkdir -p "$SKILLS_DIR"
fi

# Copy skills from fork to superpowers-agents/skills
echo "Copying skills from fork to superpowers-agents/skills..."
rm -rf "$SKILLS_DIR"/*
cp -r "$FORK_DIR/skills/." "$SKILLS_DIR/"

# Copy custom skills if they exist
CUSTOM_SKILLS_DIR="$SCRIPT_DIR/custom/skills"
if [ -d "$CUSTOM_SKILLS_DIR" ] && [ "$(ls -A $CUSTOM_SKILLS_DIR)" ]; then
    echo "Copying custom skills..."
    cp -r "$CUSTOM_SKILLS_DIR/." "$SKILLS_DIR/"
fi

echo ""
echo "✓ Skills updated successfully!"
echo ""
echo "Current fork status:"
git log --oneline -1

echo ""
echo "Refreshing agent runtime paths..."
"$SCRIPT_DIR/setup-agents.sh"
