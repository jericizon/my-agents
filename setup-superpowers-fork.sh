#!/usr/bin/env bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORK_DIR="$SCRIPT_DIR/superpowers-fork"
SKILLS_DIR="$SCRIPT_DIR/superpowers-agents/skills"
AGENTS_DIR="$SCRIPT_DIR/superpowers-agents"
TARGET_LINK="$HOME/.agents"
UPSTREAM_REPO="https://github.com/obra/superpowers.git"

echo "Setting up superpowers fork in: $FORK_DIR"

# Create fork directory
if [ -d "$FORK_DIR" ]; then
    echo "Fork directory already exists. Updating..."
    cd "$FORK_DIR"
    git fetch upstream
else
    echo "Cloning superpowers repository..."
    git clone --depth 1 "$UPSTREAM_REPO" "$FORK_DIR"
    cd "$FORK_DIR"
    
    # Add upstream remote for future updates
    git remote rename origin upstream
fi

# Create superpowers-agents/skills directory if it doesn't exist
if [ ! -d "$SKILLS_DIR" ]; then
    echo "Creating superpowers-agents/skills directory..."
    mkdir -p "$SKILLS_DIR"
fi

# Copy skills from fork to superpowers-agents/skills
echo "Copying skills from fork to superpowers-agents/skills..."
cp -r "$FORK_DIR/skills/"* "$SKILLS_DIR/"

# Copy custom skills if they exist
CUSTOM_SKILLS_DIR="$SCRIPT_DIR/custom/skills"
if [ -d "$CUSTOM_SKILLS_DIR" ] && [ "$(ls -A $CUSTOM_SKILLS_DIR)" ]; then
    echo "Copying custom skills..."
    cp -r "$CUSTOM_SKILLS_DIR"/* "$SKILLS_DIR/"
fi

echo ""
echo "✓ Setup complete!"
echo ""

# Update global symlink
echo "Updating global .agents symlink..."

# Backup existing target
if [ -e "$TARGET_LINK" ] || [ -L "$TARGET_LINK" ]; then
    BACKUP_LINK="${TARGET_LINK}.backup.$(date +%s)"
    echo "Backing up existing target to: $BACKUP_LINK"
    mv "$TARGET_LINK" "$BACKUP_LINK"
fi

# Create symlink
echo "Creating symlink: $TARGET_LINK -> $AGENTS_DIR"
ln -s "$AGENTS_DIR" "$TARGET_LINK"

echo ""
echo "✓ Global .agents symlink created!"
echo ""
echo "To update from upstream in the future, run:"
echo "  ./update-skills.sh"
echo ""
echo "To push to your own fork (if you have one):"
echo "  cd $FORK_DIR"
echo "  git remote add origin YOUR_FORK_URL"
echo "  git push -u origin main"
