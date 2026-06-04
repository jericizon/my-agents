#!/usr/bin/env bash
set -euo pipefail

TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEST_ROOT"' EXIT

WORKDIR="$TEST_ROOT/work"
REMOTE="$TEST_ROOT/remote.git"
SEED="$TEST_ROOT/seed"
mkdir -p "$WORKDIR"
mkdir -p "$TEST_ROOT/home"

git init --bare "$REMOTE" >/dev/null

git init "$SEED" >/dev/null
cd "$SEED"
git config user.name test
git config user.email test@example.com
mkdir -p skills/sample-skill
cat > skills/sample-skill/SKILL.md <<'SKILL'
# Sample
SKILL
git add skills/sample-skill/SKILL.md
git -c commit.gpgsign=false commit -m "seed" >/dev/null
git branch -M main
git remote add origin "$REMOTE"
git push -u origin main >/dev/null

cd "$WORKDIR"
git clone "$REMOTE" superpowers-fork >/dev/null
cd superpowers-fork
git checkout main >/dev/null
# Ensure no upstream remote exists
if git remote | grep -qx upstream; then
  echo "Expected no upstream remote in test setup" >&2
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

echo "PASS: update-skills handles missing upstream remote"
