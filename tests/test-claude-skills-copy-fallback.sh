#!/usr/bin/env bash
set -euo pipefail

TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEST_ROOT"' EXIT

WORKDIR="$TEST_ROOT/work"
REMOTE="$TEST_ROOT/remote.git"
SEED="$TEST_ROOT/seed"
HOME_DIR="$TEST_ROOT/home"
FAKE_BIN="$TEST_ROOT/fake-bin"

mkdir -p "$WORKDIR" "$HOME_DIR" "$FAKE_BIN"

git init --bare "$REMOTE" >/dev/null

git init "$SEED" >/dev/null
cd "$SEED"
git config user.name test
git config user.email test@example.com
mkdir -p skills/sample-skill
cat > skills/sample-skill/SKILL.md <<'SKILL'
---
name: sample-skill
description: Use when validating Claude fallback sync behavior.
---

# Sample Skill
SKILL
git add skills/sample-skill/SKILL.md
git -c commit.gpgsign=false commit -m "seed" >/dev/null
git branch -M main
git remote add origin "$REMOTE"
git push -u origin main >/dev/null

REPO_ROOT="/home/jeric/Workspace/my-agents"

mkdir -p "$WORKDIR/custom/skills/custom-skill"
cat > "$WORKDIR/custom/skills/custom-skill/SKILL.md" <<'SKILL'
---
name: custom-skill
description: Use when validating custom Claude fallback sync behavior.
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

cat > "$FAKE_BIN/ln" <<'LN'
#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "-s" && "${3:-}" == *"/.claude/skills" ]]; then
  echo "simulated ln failure for Claude skills target" >&2
  exit 1
fi

exec /bin/ln "$@"
LN
chmod +x "$FAKE_BIN/ln"

git clone "$REMOTE" "$WORKDIR/superpowers-fork" >/dev/null
(
  cd "$WORKDIR/superpowers-fork"
  git checkout main >/dev/null
)

cd "$WORKDIR"
git init >/dev/null
git config user.name test
git config user.email test@example.com
git add .gitignore README.md custom shared *.sh superpowers-fork
git -c commit.gpgsign=false commit -m "fixture" >/dev/null

PATH="$FAKE_BIN:$PATH" HOME="$HOME_DIR" ./sync-agents.sh >/dev/null

test -L "$HOME_DIR/.agents"
test "$(readlink "$HOME_DIR/.agents")" = "$WORKDIR/superpowers-agents"
test -d "$HOME_DIR/.claude/skills"
test ! -L "$HOME_DIR/.claude/skills"
test -f "$HOME_DIR/.claude/skills/sample-skill/SKILL.md"
test -f "$HOME_DIR/.claude/skills/custom-skill/SKILL.md"

echo "PASS: Claude skills fall back to copy when symlink creation fails"
