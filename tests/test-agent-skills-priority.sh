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
(
  cd "$SUPER_SEED"
  git config user.name test
  git config user.email test@example.com
  mkdir -p skills/test-driven-development
  cat > skills/test-driven-development/SKILL.md <<'SKILL'
SUPERPOWERS VERSION
SKILL
  git add skills/test-driven-development/SKILL.md
  git -c commit.gpgsign=false commit -m "seed super" >/dev/null
  git branch -M main
  git remote add origin "$SUPER_REMOTE"
  git push -u origin main >/dev/null
)

git init --bare "$ADDY_REMOTE" >/dev/null
git init "$ADDY_SEED" >/dev/null
(
  cd "$ADDY_SEED"
  git config user.name test
  git config user.email test@example.com
  mkdir -p skills/test-driven-development skills/addy-only-skill
  cat > skills/test-driven-development/SKILL.md <<'SKILL'
ADDY VERSION
SKILL
  cat > skills/addy-only-skill/SKILL.md <<'SKILL'
ADDY ONLY
SKILL
  git add skills/test-driven-development/SKILL.md
  git add skills/addy-only-skill/SKILL.md
  git -c commit.gpgsign=false commit -m "seed addy" >/dev/null
  git branch -M main
  git remote add origin "$ADDY_REMOTE"
  git push -u origin main >/dev/null
)

REPO_ROOT="/home/jeric/Workspace/my-agents"

mkdir -p "$WORKDIR/custom/skills/custom-skill" "$WORKDIR/shared/rules"
cat > "$WORKDIR/custom/skills/custom-skill/SKILL.md" <<'SKILL'
# Custom
SKILL
cat > "$WORKDIR/shared/rules/global_rules.md" <<'RULES'
# Rules
RULES

cp "$REPO_ROOT/sync-agents.sh" "$WORKDIR/"
cp "$REPO_ROOT/README.md" "$WORKDIR/"
cp "$REPO_ROOT/.gitignore" "$WORKDIR/"
chmod +x "$WORKDIR/"*.sh

git clone "$SUPER_REMOTE" "$WORKDIR/superpowers-fork" >/dev/null
git clone "$ADDY_REMOTE" "$WORKDIR/agent-skills-fork" >/dev/null
(
  cd "$WORKDIR/superpowers-fork"
  git checkout main >/dev/null
)
(
  cd "$WORKDIR/agent-skills-fork"
  git checkout main >/dev/null
)

cd "$WORKDIR"
update_log="$TEST_ROOT/sync-agents.log"
HOME="$HOME_DIR" ./sync-agents.sh >"$update_log"

skill_file="$WORKDIR/superpowers-agents/skills/test-driven-development/SKILL.md"
grep -Fq "SUPERPOWERS VERSION" "$skill_file"
if grep -Fq "ADDY VERSION" "$skill_file"; then
  echo "Expected Superpowers collision winner, but Addy content was present" >&2
  exit 1
fi
test -f "$WORKDIR/superpowers-agents/skills/addy-only-skill/SKILL.md"
grep -Fq "Skipping agent-skills skill 'test-driven-development'" "$update_log"

echo "PASS: Superpowers wins when agent-skills collides on skill name"
