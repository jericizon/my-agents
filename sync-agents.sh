#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORK_DIR="$SCRIPT_DIR/superpowers-fork"

echo "Running unified agents sync..."
echo ""

if [ ! -d "$FORK_DIR/.git" ]; then
    echo "Fresh setup detected (missing superpowers-fork)."
    "$SCRIPT_DIR/setup-superpowers-fork.sh"
else
    echo "Existing setup detected."
fi

echo ""
echo "Updating skills..."
"$SCRIPT_DIR/update-skills.sh"

echo ""
echo "Updating global rules..."
"$SCRIPT_DIR/install-global-rules.sh"

echo ""
echo "Done. Skills and global rules are up to date."
