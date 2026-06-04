#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$SCRIPT_DIR/superpowers-agents"
SKILLS_SOURCE_DIR="$SOURCE_DIR/skills"
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

echo "Installing agent runtime paths..."

# Check source exists
if [ ! -d "$SOURCE_DIR" ]; then
    echo "ERROR: Source directory does not exist:"
    echo "$SOURCE_DIR"
    exit 1
fi

if [ ! -d "$SKILLS_SOURCE_DIR" ]; then
    echo "ERROR: Skills source directory does not exist:"
    echo "$SKILLS_SOURCE_DIR"
    exit 1
fi

echo "Syncing Codex runtime path..."
install_symlink "$SOURCE_DIR" "$AGENTS_TARGET"

echo ""
echo "Syncing Claude Code skills path..."
install_symlink_or_copy "$SKILLS_SOURCE_DIR" "$CLAUDE_SKILLS_TARGET" "Claude Code skills"
