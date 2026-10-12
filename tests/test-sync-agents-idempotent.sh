#!/usr/bin/env bash
set -euo pipefail

TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEST_ROOT"' EXIT

WORKDIR="$TEST_ROOT/work"
SUPER_REMOTE="$TEST_ROOT/super.git"
SUPER_SEED="$TEST_ROOT/super-seed"
ADDY_REMOTE="$TEST_ROOT/addy.git"
ADDY_SEED="$TEST_ROOT/addy-seed"
UIUX_REMOTE="$TEST_ROOT/uiux.git"
UIUX_SEED="$TEST_ROOT/uiux-seed"
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

mkdir -p "$WORKDIR/shared/rules" "$WORKDIR/shared/policy"
cat > "$WORKDIR/shared/rules/global_rules.md" <<'RULES'
# Global Rules
RULES
cat > "$WORKDIR/shared/policy/TASK_CONTINUITY.md" <<'POLICY'
# Universal AI Coding Agent Policy
POLICY

cp "$REPO_ROOT/sync-agents.sh" "$WORKDIR/"
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

git init --bare "$UIUX_REMOTE" >/dev/null

git init "$UIUX_SEED" >/dev/null
cd "$UIUX_SEED"
git config user.name test
git config user.email test@example.com
mkdir -p .claude/skills/ui-ux-pro-max
cat > .claude/skills/ui-ux-pro-max/SKILL.md <<'SKILL'
---
name: ui-ux-pro-max
description: Use when validating ui-ux allowlist sync behavior.
---

# UI UX Skill
SKILL
git add .claude/skills/ui-ux-pro-max/SKILL.md
git -c commit.gpgsign=false commit -m "seed" >/dev/null
git branch -M main
git remote add origin "$UIUX_REMOTE"
git push -u origin main >/dev/null

git clone "$UIUX_REMOTE" "$WORKDIR/ui-ux-fork" >/dev/null
(
  cd "$WORKDIR/ui-ux-fork"
  git checkout main >/dev/null
)

cd "$WORKDIR"
git init >/dev/null
git config user.name test
git config user.email test@example.com
git add .gitignore README.md custom shared *.sh superpowers-fork agent-skills-fork ui-ux-fork
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
test -f "$WORKDIR/superpowers-agents/skills/ui-ux-pro-max/SKILL.md"
test -L "$HOME_DIR/.agents"
test "$(readlink "$HOME_DIR/.agents")" = "$WORKDIR/superpowers-agents"
test -L "$HOME_DIR/.claude/skills"
test "$(readlink "$HOME_DIR/.claude/skills")" = "$WORKDIR/superpowers-agents/skills"
test -L "$HOME_DIR/.codex/AGENTS.md"
test "$(readlink "$HOME_DIR/.codex/AGENTS.md")" = "$WORKDIR/shared/rules/global_rules.md"
test -L "$HOME_DIR/.claude/CLAUDE.md"
test "$(readlink "$HOME_DIR/.claude/CLAUDE.md")" = "$WORKDIR/shared/rules/global_rules.md"
test -L "$HOME_DIR/.config/agent-workflow/TASK_CONTINUITY.md"
test "$(readlink "$HOME_DIR/.config/agent-workflow/TASK_CONTINUITY.md")" = "$WORKDIR/shared/policy/TASK_CONTINUITY.md"

echo "PASS: sync-agents is idempotent for tracked repo files"
