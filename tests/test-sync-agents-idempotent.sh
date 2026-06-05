#!/usr/bin/env bash
set -euo pipefail

TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEST_ROOT"' EXIT

WORKDIR="$TEST_ROOT/work"
SUPER_REMOTE="$TEST_ROOT/super.git"
SUPER_SEED="$TEST_ROOT/super-seed"
ADDY_REMOTE="$TEST_ROOT/addy.git"
ADDY_SEED="$TEST_ROOT/addy-seed"
HOME_DIR="$TEST_ROOT/home"

mkdir -p "$WORKDIR" "$HOME_DIR"

git init --bare "$SUPER_REMOTE" >/dev/null

git init "$SUPER_SEED" >/dev/null
cd "$SUPER_SEED"
git config user.name test
git config user.email test@example.com
mkdir -p skills/sample-skill
cat > skills/sample-skill/SKILL.md <<'SKILL'
---
name: sample-skill
description: Use when validating sync tests.
---

# Sample Skill
SKILL
git add skills/sample-skill/SKILL.md
git -c commit.gpgsign=false commit -m "seed" >/dev/null
git branch -M main
git remote add origin "$SUPER_REMOTE"
git push -u origin main >/dev/null

git init --bare "$ADDY_REMOTE" >/dev/null

git init "$ADDY_SEED" >/dev/null
cd "$ADDY_SEED"
git config user.name test
git config user.email test@example.com
mkdir -p skills/addy-skill
cat > skills/addy-skill/SKILL.md <<'SKILL'
---
name: addy-skill
description: Use when validating secondary upstream sync behavior.
---

# Addy Skill
SKILL
git add skills/addy-skill/SKILL.md
git -c commit.gpgsign=false commit -m "seed" >/dev/null
git branch -M main
git remote add origin "$ADDY_REMOTE"
git push -u origin main >/dev/null

REPO_ROOT="/home/jeric/Workspace/my-agents"

mkdir -p "$WORKDIR/custom/skills/custom-skill"
cat > "$WORKDIR/custom/skills/custom-skill/SKILL.md" <<'SKILL'
---
name: custom-skill
description: Use when validating custom skill sync behavior.
---

# Custom Skill
SKILL

mkdir -p "$WORKDIR/shared/rules"
cat > "$WORKDIR/shared/rules/global_rules.md" <<'RULES'
# Global Rules
RULES

cp "$REPO_ROOT/sync-agents.sh" "$WORKDIR/"
cp "$REPO_ROOT/update-skills.sh" "$WORKDIR/"
cp "$REPO_ROOT/setup-superpowers-fork.sh" "$WORKDIR/"
cp "$REPO_ROOT/setup-agents.sh" "$WORKDIR/"
cp "$REPO_ROOT/install-global-rules.sh" "$WORKDIR/"
cp "$REPO_ROOT/README.md" "$WORKDIR/"
cp "$REPO_ROOT/.gitignore" "$WORKDIR/"
chmod +x "$WORKDIR/"*.sh

git clone "$SUPER_REMOTE" "$WORKDIR/superpowers-fork" >/dev/null
(
  cd "$WORKDIR/superpowers-fork"
  git checkout main >/dev/null
)

git clone "$ADDY_REMOTE" "$WORKDIR/agent-skills-fork" >/dev/null
(
  cd "$WORKDIR/agent-skills-fork"
  git checkout main >/dev/null
)

cd "$WORKDIR"
git init >/dev/null
git config user.name test
git config user.email test@example.com
git add .gitignore README.md custom shared *.sh superpowers-fork agent-skills-fork
git -c commit.gpgsign=false commit -m "fixture" >/dev/null

HOME="$HOME_DIR" ./sync-agents.sh >/dev/null

if [[ -n "$(git status --short)" ]]; then
  echo "Expected clean git status after sync-agents.sh" >&2
  git status --short >&2
  exit 1
fi

test -f "$WORKDIR/superpowers-agents/skills/sample-skill/SKILL.md"
test -f "$WORKDIR/superpowers-agents/skills/addy-skill/SKILL.md"
test -f "$WORKDIR/superpowers-agents/skills/custom-skill/SKILL.md"
test -L "$HOME_DIR/.agents"
test "$(readlink "$HOME_DIR/.agents")" = "$WORKDIR/superpowers-agents"
test -L "$HOME_DIR/.claude/skills"
test "$(readlink "$HOME_DIR/.claude/skills")" = "$WORKDIR/superpowers-agents/skills"

echo "PASS: sync-agents is idempotent for tracked repo files"
