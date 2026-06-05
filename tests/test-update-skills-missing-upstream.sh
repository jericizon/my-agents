#!/usr/bin/env bash
set -euo pipefail

TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEST_ROOT"' EXIT

WORKDIR="$TEST_ROOT/work"
SUPER_REMOTE="$TEST_ROOT/super.git"
SUPER_SEED="$TEST_ROOT/super-seed"
ADDY_REMOTE="$TEST_ROOT/addy.git"
ADDY_SEED="$TEST_ROOT/addy-seed"
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

git init --bare "$ADDY_REMOTE" >/dev/null

git init "$ADDY_SEED" >/dev/null
cd "$ADDY_SEED"
git config user.name test
git config user.email test@example.com
mkdir -p skills/addy-skill
cat > skills/addy-skill/SKILL.md <<'SKILL'
# Addy
SKILL
git add skills/addy-skill/SKILL.md
git -c commit.gpgsign=false commit -m "seed" >/dev/null
git branch -M main
git remote add origin "$ADDY_REMOTE"
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
git clone "$ADDY_REMOTE" agent-skills-fork >/dev/null
cd agent-skills-fork
git checkout main >/dev/null
if git remote | grep -qx upstream; then
  echo "Expected no upstream remote in test setup for agent-skills-fork" >&2
  exit 1
fi

cd "$WORKDIR"
mkdir -p superpowers-agents custom/skills
cp /home/jeric/Workspace/my-agents/update-skills.sh "$WORKDIR/update-skills.sh"
cp /home/jeric/Workspace/my-agents/setup-agents.sh "$WORKDIR/setup-agents.sh"
chmod +x "$WORKDIR/update-skills.sh"
chmod +x "$WORKDIR/setup-agents.sh"

if ! HOME="$TEST_ROOT/home" "$WORKDIR/update-skills.sh" >"$TEST_ROOT/update-skills.log" 2>&1; then
  cat "$TEST_ROOT/update-skills.log" >&2
  exit 1
fi

test -f "$WORKDIR/superpowers-agents/skills/sample-skill/SKILL.md"
test -f "$WORKDIR/superpowers-agents/skills/addy-skill/SKILL.md"

echo "PASS: update-skills handles missing upstream remote"
