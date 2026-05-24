#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_RULES="$SCRIPT_DIR/shared/rules/global_rules.md"
TIMESTAMP="$(date +%s)"

if [ ! -f "$SOURCE_RULES" ]; then
    echo "ERROR: Canonical rules file not found: $SOURCE_RULES"
    exit 1
fi

TARGETS=(
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

for target in "${TARGETS[@]}"; do
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

echo ""
echo "Done. Global rules linked for all configured CLIs."
