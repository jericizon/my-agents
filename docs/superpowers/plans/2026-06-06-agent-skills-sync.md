# Agent Skills Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `addyosmani/agent-skills` as a second upstream source so `./sync-agents.sh` rebuilds one merged generated skill tree where Superpowers wins on collisions and local custom skills still apply last.

**Architecture:** Keep the current generated-tree model. Extend the existing shell scripts to manage a second local mirror, rebuild `superpowers-agents/skills` from ordered sources, and leave runtime-path installation centralized in `setup-agents.sh`. Cover the change with fixture-based shell tests that verify both unique imports and collision precedence.

**Tech Stack:** Bash scripts, Git mirror clones, Markdown docs, repo-local shell regression tests

**Spec:** `docs/superpowers/specs/2026-06-06-agent-skills-sync-design.md`

---

## Requirement-to-Task Alignment

| Requirement | Tasks | Tests/QA |
|---|---|---|
| `./sync-agents.sh` remains the single entrypoint for fresh setup and updates | 2, 3, 5 | `bash tests/test-sync-agents-idempotent.sh`, manual `./sync-agents.sh` smoke output review |
| Maintain a second local mirror for `addyosmani/agent-skills` | 2, 3 | `bash tests/test-sync-agents-idempotent.sh`, `bash tests/test-update-skills-missing-upstream.sh`, new Addy import test |
| Rebuild `superpowers-agents/skills` from ordered sources | 3, 5 | new Addy import test, new collision-precedence test |
| Superpowers wins on skill-name collisions | 1, 3, 5 | new collision-precedence test |
| `custom/skills` still overrides both upstreams | 3, 5 | `bash tests/test-sync-agents-idempotent.sh` |
| Runtime exposure still flows through `setup-agents.sh` into `~/.agents` and `~/.claude/skills` | 3, 5 | `bash tests/test-sync-agents-idempotent.sh`, `bash tests/test-claude-skills-copy-fallback.sh` |
| Script failures remain explicit when mirrors or expected directories are missing | 2, 3, 5 | `bash tests/test-update-skills-missing-upstream.sh` |
| README documents the second upstream source and precedence order | 4, 5 | manual doc review against spec |

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `sync-agents.sh` | Public entrypoint that triggers setup/update flow | Modify |
| `setup-superpowers-fork.sh` | First-time local mirror setup for both upstream repositories | Modify |
| `update-skills.sh` | Refresh both upstream mirrors, rebuild merged generated tree, refresh runtime links | Modify |
| `README.md` | Document the new two-upstream merge flow and precedence | Modify |
| `tests/test-sync-agents-idempotent.sh` | Existing end-to-end sync fixture; expand to include second mirror and merged tree expectations | Modify |
| `tests/test-update-skills-missing-upstream.sh` | Existing update behavior coverage; expand to include second mirror/upstream handling | Modify |
| `tests/test-agent-skills-import.sh` | Verifies a unique Addy skill is merged into the generated tree | Create |
| `tests/test-agent-skills-priority.sh` | Verifies Superpowers remains authoritative on collisions | Create |
| `docs/superpowers/specs/2026-06-06-agent-skills-sync-design.md` | Approved design reference | Reference only |
| `docs/superpowers/plans/2026-06-06-agent-skills-sync.md` | Implementation handoff artifact | Create |

---

### Task 1: Add failing merge-behavior regression tests first

**Files:**
- Create: `tests/test-agent-skills-import.sh`
- Create: `tests/test-agent-skills-priority.sh`

- [ ] **Step 1: Create the unique-import regression test**

Create `tests/test-agent-skills-import.sh` with this content:

```bash
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
  mkdir -p skills/super-only-skill
  cat > skills/super-only-skill/SKILL.md <<'SKILL'
# Super only
SKILL
  git add skills/super-only-skill/SKILL.md
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
  mkdir -p skills/addy-only-skill
  cat > skills/addy-only-skill/SKILL.md <<'SKILL'
# Addy only
SKILL
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
cp "$REPO_ROOT/update-skills.sh" "$WORKDIR/"
cp "$REPO_ROOT/setup-superpowers-fork.sh" "$WORKDIR/"
cp "$REPO_ROOT/setup-agents.sh" "$WORKDIR/"
cp "$REPO_ROOT/install-global-rules.sh" "$WORKDIR/"
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
git init >/dev/null
git config user.name test
git config user.email test@example.com
git add .gitignore README.md custom shared *.sh superpowers-fork agent-skills-fork
git -c commit.gpgsign=false commit -m "fixture" >/dev/null

HOME="$HOME_DIR" ./sync-agents.sh >/dev/null

test -f "$WORKDIR/superpowers-agents/skills/super-only-skill/SKILL.md"
test -f "$WORKDIR/superpowers-agents/skills/addy-only-skill/SKILL.md"
test -f "$WORKDIR/superpowers-agents/skills/custom-skill/SKILL.md"

echo "PASS: sync imports unique Addy skills into the generated tree"
```

- [ ] **Step 2: Create the collision-precedence regression test**

Create `tests/test-agent-skills-priority.sh` with this content:

```bash
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
  mkdir -p skills/test-driven-development
  cat > skills/test-driven-development/SKILL.md <<'SKILL'
ADDY VERSION
SKILL
  git add skills/test-driven-development/SKILL.md
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
cp "$REPO_ROOT/update-skills.sh" "$WORKDIR/"
cp "$REPO_ROOT/setup-superpowers-fork.sh" "$WORKDIR/"
cp "$REPO_ROOT/setup-agents.sh" "$WORKDIR/"
cp "$REPO_ROOT/install-global-rules.sh" "$WORKDIR/"
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

HOME="$HOME_DIR" "$WORKDIR/update-skills.sh" >/dev/null

skill_file="$WORKDIR/superpowers-agents/skills/test-driven-development/SKILL.md"
grep -Fq "SUPERPOWERS VERSION" "$skill_file"
if grep -Fq "ADDY VERSION" "$skill_file"; then
  echo "Expected Superpowers collision winner, but Addy content was present" >&2
  exit 1
fi

echo "PASS: Superpowers wins when agent-skills collides on skill name"
```

- [ ] **Step 3: Make both tests executable**

Run:

```bash
chmod +x tests/test-agent-skills-import.sh tests/test-agent-skills-priority.sh
```

Expected: no output

- [ ] **Step 4: Run the new tests to verify RED**

Run:

```bash
bash tests/test-agent-skills-import.sh
bash tests/test-agent-skills-priority.sh
```

Expected:
- the import test fails because current scripts do not merge `agent-skills-fork` into `superpowers-agents/skills`
- the priority test fails because current scripts do not intentionally process collisions from a second upstream yet

---

### Task 2: Extend first-time setup to manage both upstream mirrors

**Files:**
- Modify: `setup-superpowers-fork.sh`

- [ ] **Step 1: Add the second upstream constants**

Update the variable section in `setup-superpowers-fork.sh` to define:

```bash
FORK_DIR="$SCRIPT_DIR/superpowers-fork"
AGENT_SKILLS_FORK_DIR="$SCRIPT_DIR/agent-skills-fork"
SKILLS_DIR="$SCRIPT_DIR/superpowers-agents/skills"
UPSTREAM_REPO="https://github.com/obra/superpowers.git"
AGENT_SKILLS_UPSTREAM_REPO="https://github.com/addyosmani/agent-skills.git"
```

- [ ] **Step 2: Extract a reusable mirror setup helper**

Add a helper with the exact responsibility below:

```bash
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
```

- [ ] **Step 3: Make upstream-remote setup accept an explicit URL**

Replace the current helper with:

```bash
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
```

- [ ] **Step 4: Call the helper for both upstream mirrors**

Replace the single-repo clone/update block with:

```bash
echo "Setting up Superpowers fork in: $FORK_DIR"
setup_mirror_repo "$FORK_DIR" "$UPSTREAM_REPO" "Superpowers"

echo "Setting up agent-skills mirror in: $AGENT_SKILLS_FORK_DIR"
setup_mirror_repo "$AGENT_SKILLS_FORK_DIR" "$AGENT_SKILLS_UPSTREAM_REPO" "agent-skills"
```

- [ ] **Step 5: Remove generated-tree copying from setup script**

Delete the block that directly copies skills into `superpowers-agents/skills`. Replace it with:

```bash
echo ""
echo "Refreshing generated skills tree..."
"$SCRIPT_DIR/update-skills.sh"
```

Expected result:
- first-time setup becomes responsible for mirror readiness only
- tree generation remains centralized in `update-skills.sh`

---

### Task 3: Rebuild the generated tree from ordered sources

**Files:**
- Modify: `update-skills.sh`

- [ ] **Step 1: Add second-mirror variables and explicit repo URLs**

Update the variable block to:

```bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORK_DIR="$SCRIPT_DIR/superpowers-fork"
AGENT_SKILLS_FORK_DIR="$SCRIPT_DIR/agent-skills-fork"
SKILLS_DIR="$SCRIPT_DIR/superpowers-agents/skills"
UPSTREAM_REPO="https://github.com/obra/superpowers.git"
AGENT_SKILLS_UPSTREAM_REPO="https://github.com/addyosmani/agent-skills.git"
```

- [ ] **Step 2: Reuse a parameterized upstream helper**

Replace `ensure_upstream_remote` with:

```bash
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
```

- [ ] **Step 3: Add reusable mirror validation and refresh helpers**

Add these helpers above the update flow:

```bash
require_repo_dir() {
    local repo_dir="$1"
    local label="$2"

    if [ ! -d "$repo_dir/.git" ]; then
        echo "ERROR: $label mirror directory does not exist: $repo_dir"
        echo "Please run ./setup-superpowers-fork.sh first"
        exit 1
    fi
}

refresh_repo() {
    local repo_dir="$1"
    local remote_url="$2"
    local label="$3"

    require_repo_dir "$repo_dir" "$label"

    cd "$repo_dir"
    ensure_upstream_remote "$remote_url"
    echo "Fetching $label upstream..."
    git fetch upstream
    echo "Resetting $label to latest upstream/main..."
    git reset --hard upstream/main
}

require_skills_source_dir() {
    local source_dir="$1"
    local label="$2"

    if [ ! -d "$source_dir" ]; then
        echo "ERROR: Expected $label skills directory does not exist: $source_dir"
        exit 1
    fi
}

copy_missing_skill_dirs() {
    local source_dir="$1"
    local destination_dir="$2"
    local label="$3"

    for skill_dir in "$source_dir"/*; do
        [ -d "$skill_dir" ] || continue
        skill_name="$(basename "$skill_dir")"
        destination_skill_dir="$destination_dir/$skill_name"

        if [ -e "$destination_skill_dir" ]; then
            echo "Skipping $label skill '$skill_name' because Superpowers already provides it."
            continue
        fi

        cp -R "$skill_dir" "$destination_skill_dir"
        echo "Imported $label skill '$skill_name'."
    done
}
```

- [ ] **Step 4: Refresh both mirrors before tree generation**

Replace the current single-mirror update flow with:

```bash
echo "Updating skills from Superpowers and agent-skills..."

refresh_repo "$FORK_DIR" "$UPSTREAM_REPO" "Superpowers"
refresh_repo "$AGENT_SKILLS_FORK_DIR" "$AGENT_SKILLS_UPSTREAM_REPO" "agent-skills"
```

- [ ] **Step 5: Rebuild the generated tree in precedence order**

Replace the current copy block with:

```bash
SUPERPOWERS_SKILLS_SOURCE="$FORK_DIR/skills"
AGENT_SKILLS_SOURCE="$AGENT_SKILLS_FORK_DIR/skills"
CUSTOM_SKILLS_DIR="$SCRIPT_DIR/custom/skills"

require_skills_source_dir "$SUPERPOWERS_SKILLS_SOURCE" "Superpowers"
require_skills_source_dir "$AGENT_SKILLS_SOURCE" "agent-skills"

if [ ! -d "$SKILLS_DIR" ]; then
    echo "Creating superpowers-agents/skills directory..."
    mkdir -p "$SKILLS_DIR"
fi

echo "Rebuilding generated skills tree..."
rm -rf "$SKILLS_DIR"/*
cp -R "$SUPERPOWERS_SKILLS_SOURCE/." "$SKILLS_DIR/"
copy_missing_skill_dirs "$AGENT_SKILLS_SOURCE" "$SKILLS_DIR" "agent-skills"

if [ -d "$CUSTOM_SKILLS_DIR" ] && [ "$(ls -A "$CUSTOM_SKILLS_DIR")" ]; then
    echo "Copying custom skills..."
    cp -R "$CUSTOM_SKILLS_DIR/." "$SKILLS_DIR/"
fi
```

- [ ] **Step 6: Keep runtime refresh at the end**

Retain:

```bash
echo ""
echo "Refreshing agent runtime paths..."
"$SCRIPT_DIR/setup-agents.sh"
```

Expected result:
- one generated tree
- Superpowers base
- Addy unique additions only
- local custom overrides last

---

### Task 4: Update the public docs for the new merge flow

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the repository layout section**

Change the opening description so it states:
- `superpowers-fork` is one upstream mirror
- `agent-skills-fork` is the second upstream mirror
- `superpowers-agents/skills` is the merged generated output

- [ ] **Step 2: Update the quick-start and daily-flow explanations**

Add explicit bullets that `./sync-agents.sh` now:
- updates both upstream mirrors
- rebuilds `superpowers-agents/skills` from both sources
- keeps precedence `superpowers-fork` then `agent-skills-fork` then `custom/skills`

- [ ] **Step 3: Update the add-or-override guidance**

Make the override rule explicit:

```text
Merge precedence is:
1. superpowers-fork/skills
2. agent-skills-fork/skills for non-conflicting skill names only
3. custom/skills
```

Also state that if a skill exists in both upstreams, the Superpowers version is retained unless the user overrides it in `custom/skills`.

---

### Task 5: Make the tests pass and run the verification set

**Files:**
- Modify: `tests/test-sync-agents-idempotent.sh`
- Modify: `tests/test-update-skills-missing-upstream.sh`
- Reference: `tests/test-claude-skills-copy-fallback.sh`
- Reference: `tests/test-agent-skills-import.sh`
- Reference: `tests/test-agent-skills-priority.sh`

- [ ] **Step 1: Expand the idempotency fixture to include the second mirror**

In `tests/test-sync-agents-idempotent.sh`:
- seed a second bare repo for `agent-skills-fork`
- clone it into the fixture worktree
- add one unique Addy skill
- keep the existing custom skill seed
- assert the merged tree contains Superpowers, Addy, and custom skills

- [ ] **Step 2: Expand the missing-upstream regression**

In `tests/test-update-skills-missing-upstream.sh`:
- seed both local mirror repos without an `upstream` remote
- copy the current `update-skills.sh` and `setup-agents.sh` into the fixture
- assert the generated tree contains one Superpowers skill and one Addy skill after the script adds missing upstream remotes and rebuilds the merged tree

- [ ] **Step 3: Run the targeted regression set**

Run:

```bash
bash tests/test-agent-skills-import.sh
bash tests/test-agent-skills-priority.sh
bash tests/test-sync-agents-idempotent.sh
bash tests/test-update-skills-missing-upstream.sh
bash tests/test-claude-skills-copy-fallback.sh
```

Expected: all PASS

- [ ] **Step 4: Run a real script smoke check in the repository**

Run:

```bash
./sync-agents.sh
```

Expected:
- both upstream mirrors update successfully
- `superpowers-agents/skills` rebuilds without errors
- `~/.agents` and `~/.claude/skills` refresh successfully

- [ ] **Step 5: Inspect the final diff for scope control**

Run:

```bash
git status --short
git diff -- sync-agents.sh setup-superpowers-fork.sh update-skills.sh README.md tests
```

Expected:
- only the intended scripts, docs, and tests are changed
- no unrelated user changes are reverted

## Self-Review

- Spec coverage: all requirements map to tasks 1 through 5, including two-upstream setup, ordered merge behavior, runtime refresh preservation, collision precedence, tests, and README updates.
- Placeholder scan: no `TODO`, `TBD`, or vague “add handling” steps remain; every script change names the exact function or block to add or replace.
- Type consistency: the plan consistently uses `agent-skills-fork`, `AGENT_SKILLS_FORK_DIR`, `AGENT_SKILLS_UPSTREAM_REPO`, `copy_missing_skill_dirs`, and the precedence order `Superpowers -> agent-skills -> custom`.
- Requirement mapping: every acceptance criterion is tied to either the new merge tests, the existing runtime-link tests, or the final `./sync-agents.sh` smoke run.

Plan complete and saved to `docs/superpowers/plans/2026-06-06-agent-skills-sync.md`. Two execution options:

1. Subagent-Driven (recommended) - dispatch a fresh subagent per task, with review between tasks.
2. Inline Execution - execute tasks in this session using the plan above.

Default if no change is requested: Inline Execution in this session.
