#!/usr/bin/env bash
set -euo pipefail

TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEST_ROOT"' EXIT

WORKDIR="$TEST_ROOT/work"
SUPER_REMOTE="$TEST_ROOT/super.git"
SUPER_SEED="$TEST_ROOT/super-seed"
UIUX_REMOTE="$TEST_ROOT/uiux.git"
UIUX_SEED="$TEST_ROOT/uiux-seed"
mkdir -p "$WORKDIR"
mkdir -p "$TEST_ROOT/home"

git init --bare "$SUPER_REMOTE" >/dev/null

git init "$SUPER_SEED" >/dev/null
cd "$SUPER_SEED"
git config user.name test
git config user.email test@example.com
mkdir -p skills/sample-skill
cat > skills/sample-skill/SKILL.md <<'SKILL'
# Sample
SKILL
git add skills/sample-skill/SKILL.md
git -c commit.gpgsign=false commit -m "seed" >/dev/null
git branch -M main
git remote add origin "$SUPER_REMOTE"
git push -u origin main >/dev/null

git init --bare "$UIUX_REMOTE" >/dev/null

git init "$UIUX_SEED" >/dev/null
cd "$UIUX_SEED"
git config user.name test
git config user.email test@example.com
mkdir -p .claude/skills/ui-ux-pro-max
cat > .claude/skills/ui-ux-pro-max/SKILL.md <<'SKILL'
# UI UX
SKILL
git add .claude/skills/ui-ux-pro-max/SKILL.md
git -c commit.gpgsign=false commit -m "seed" >/dev/null
git branch -M main
git remote add origin "$UIUX_REMOTE"
git push -u origin main >/dev/null

cd "$WORKDIR"
git clone "$SUPER_REMOTE" superpowers-fork >/dev/null
cd superpowers-fork
git checkout main >/dev/null
# Ensure no upstream remote exists
if git remote | grep -qx upstream; then
  echo "Expected no upstream remote in test setup" >&2
  exit 1
fi

cd "$WORKDIR"
git clone "$UIUX_REMOTE" ui-ux-fork >/dev/null
cd ui-ux-fork
git checkout main >/dev/null
if git remote | grep -qx upstream; then
  echo "Expected no upstream remote in test setup for ui-ux-fork" >&2
  exit 1
fi

cd "$WORKDIR"
mkdir -p superpowers-agents custom/skills
mkdir -p "$WORKDIR/shared/rules" "$WORKDIR/shared/policy"
cat > "$WORKDIR/shared/rules/global_rules.md" <<'RULES'
# Global Rules
RULES
cat > "$WORKDIR/shared/policy/TASK_CONTINUITY.md" <<'POLICY'
# Universal AI Coding Agent Policy
POLICY
cp /home/jeric/Workspace/my-agents/sync-agents.sh "$WORKDIR/sync-agents.sh"
cp /home/jeric/Workspace/my-agents/README.md "$WORKDIR/README.md"
cp /home/jeric/Workspace/my-agents/.gitignore "$WORKDIR/.gitignore"
chmod +x "$WORKDIR/sync-agents.sh"

if ! HOME="$TEST_ROOT/home" "$WORKDIR/sync-agents.sh" >"$TEST_ROOT/sync-agents.log" 2>&1; then
  cat "$TEST_ROOT/sync-agents.log" >&2
  exit 1
fi

test -f "$WORKDIR/superpowers-agents/skills/sample-skill/SKILL.md"
test -f "$WORKDIR/superpowers-agents/skills/ui-ux-pro-max/SKILL.md"

echo "PASS: update-skills handles missing upstream remote"
