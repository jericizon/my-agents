#!/usr/bin/env bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORK_DIR="$SCRIPT_DIR/superpowers-fork"
SKILLS_DIR="$SCRIPT_DIR/superpowers-agents/skills"
AGENTS_DIR="$SCRIPT_DIR/superpowers-agents"
TARGET_LINK="$HOME/.agents"

echo "Updating skills from obra/superpowers fork..."

# Check if fork directory exists
if [ ! -d "$FORK_DIR" ]; then
    echo "ERROR: Fork directory does not exist: $FORK_DIR"
    echo "Please run ./setup-superpowers-fork.sh first"
    exit 1
fi

cd "$FORK_DIR"

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
cp -r "$FORK_DIR/skills/"* "$SKILLS_DIR/"

# Copy custom skills if they exist
CUSTOM_SKILLS_DIR="$SCRIPT_DIR/custom/skills"
if [ -d "$CUSTOM_SKILLS_DIR" ] && [ "$(ls -A $CUSTOM_SKILLS_DIR)" ]; then
    echo "Copying custom skills..."
    cp -r "$CUSTOM_SKILLS_DIR"/* "$SKILLS_DIR/"
fi

echo ""
echo "✓ Skills updated successfully!"
echo ""
echo "Current fork status:"
git log --oneline -1

# Update global symlink
echo ""
echo "Updating global .agents symlink..."

# Handle existing target
if [ -e "$TARGET_LINK" ] || [ -L "$TARGET_LINK" ]; then
    echo "Found existing global .agents at: $TARGET_LINK"
    read -r -p "Backup existing .agents first? [y/N]: " BACKUP_AGENTS
    BACKUP_AGENTS="${BACKUP_AGENTS:-N}"

    if [[ "$BACKUP_AGENTS" =~ ^[Yy]$ ]]; then
        BACKUP="${TARGET_LINK}.backup.$(date +%s)"
        echo "Backing up existing target to: $BACKUP"
        mv "$TARGET_LINK" "$BACKUP"
    else
        echo "Overriding existing target..."
        rm -rf "$TARGET_LINK"
    fi
fi

# Create symlink
echo "Creating symlink: $TARGET_LINK -> $AGENTS_DIR"
ln -s "$AGENTS_DIR" "$TARGET_LINK"

echo ""
echo "✓ Global .agents symlink updated!"
