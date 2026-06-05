#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORK_DIR="$SCRIPT_DIR/superpowers-fork"
AGENT_SKILLS_FORK_DIR="$SCRIPT_DIR/agent-skills-fork"
SKILLS_DIR="$SCRIPT_DIR/superpowers-agents/skills"
UPSTREAM_REPO="https://github.com/obra/superpowers.git"
AGENT_SKILLS_UPSTREAM_REPO="https://github.com/addyosmani/agent-skills.git"

echo "Setting up upstream skill mirrors..."

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
        echo "$label directory already exists. Updating..."
        cd "$repo_dir"
        ensure_upstream_remote "$repo_url"
        git fetch upstream
        return
    fi

    echo "Cloning $label repository..."
    git clone --depth 1 "$repo_url" "$repo_dir"
    cd "$repo_dir"
    git remote rename origin upstream
}

echo "Setting up Superpowers fork in: $FORK_DIR"
setup_mirror_repo "$FORK_DIR" "$UPSTREAM_REPO" "Superpowers"

echo "Setting up agent-skills mirror in: $AGENT_SKILLS_FORK_DIR"
setup_mirror_repo "$AGENT_SKILLS_FORK_DIR" "$AGENT_SKILLS_UPSTREAM_REPO" "agent-skills"

# Create superpowers-agents/skills directory if it doesn't exist
if [ ! -d "$SKILLS_DIR" ]; then
    echo "Creating superpowers-agents/skills directory..."
    mkdir -p "$SKILLS_DIR"
fi

echo ""
echo "✓ Setup complete!"
echo ""

echo "Refreshing generated skills tree..."
"$SCRIPT_DIR/update-skills.sh"
echo ""
echo "To update from upstream in the future, run:"
echo "  ./update-skills.sh"
echo ""
echo "To push to your own fork (if you have one):"
echo "  cd $FORK_DIR"
echo "  git remote add origin YOUR_FORK_URL"
echo "  git push -u origin main"
