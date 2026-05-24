#!/usr/bin/env bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$SCRIPT_DIR/superpowers-agents"
TARGET_LINK="$HOME/.agents"

echo "Creating global symlink..."

# Check source exists
if [ ! -d "$SOURCE_DIR" ]; then
    echo "ERROR: Source directory does not exist:"
    echo "$SOURCE_DIR"
    exit 1
fi

# Backup existing target
if [ -e "$TARGET_LINK" ] || [ -L "$TARGET_LINK" ]; then
    BACKUP="${TARGET_LINK}.backup.$(date +%s)"
    echo "Backing up existing target to:"
    echo "$BACKUP"
    mv "$TARGET_LINK" "$BACKUP"
fi

# Create symlink
ln -s "$SOURCE_DIR" "$TARGET_LINK"

echo "Symlink created successfully:"
echo "$TARGET_LINK -> $SOURCE_DIR"
