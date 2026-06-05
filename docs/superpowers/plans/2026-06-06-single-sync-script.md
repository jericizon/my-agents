# Single Sync Script Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate the agent maintenance workflow into one real `sync-agents.sh` file that automatically keeps upstream mirrors, generated skills, runtime links, and global rules fully up to date.

**Architecture:** Move the logic currently spread across `setup-agents.sh`, `setup-superpowers-fork.sh`, `update-skills.sh`, and `install-global-rules.sh` into focused internal functions inside `sync-agents.sh`. Drive the refactor by updating fixture-based shell tests first so they only copy and execute `sync-agents.sh`, then delete the redundant scripts once the consolidated implementation is green.

**Tech Stack:** Bash scripts, Git mirror clones, symlink-or-copy runtime install logic, repo-local shell regression tests

**Spec:** `docs/superpowers/specs/2026-06-06-single-sync-script-design.md`

---

## Requirement-to-Task Alignment

| Requirement | Tasks | Tests/QA |
|---|---|---|
| `sync-agents.sh` is the only maintained sync entrypoint | 1, 2, 4, 5 | `bash tests/test-agent-skills-import.sh`, `bash tests/test-sync-agents-idempotent.sh`, `bash tests/test-update-skills-missing-upstream.sh`, `git diff -- sync-agents.sh README.md tests` |
| Running `./sync-agents.sh` automatically performs the full update flow | 1, 2, 4 | `bash tests/test-agent-skills-import.sh`, `bash tests/test-sync-agents-idempotent.sh`, `bash tests/test-claude-skills-copy-fallback.sh` |
| Both upstream mirrors are created or refreshed inside the consolidated script | 1, 2, 4 | `bash tests/test-agent-skills-import.sh`, `bash tests/test-update-skills-missing-upstream.sh` |
| Generated skill tree precedence remains `superpowers -> agent-skills -> custom` | 1, 2, 4 | `bash tests/test-agent-skills-import.sh`, `bash tests/test-agent-skills-priority.sh`, `bash tests/test-sync-agents-idempotent.sh` |
| Runtime link behavior remains symlink-first with Claude copy fallback | 1, 2, 4 | `bash tests/test-sync-agents-idempotent.sh`, `bash tests/test-claude-skills-copy-fallback.sh` |
| Global rules linking remains part of the no-arg sync flow | 1, 2, 4 | `bash tests/test-sync-agents-idempotent.sh` plus fixture assertions for linked rules targets |
| Deleted companion scripts are no longer required by tests or docs | 1, 3, 4 | targeted test suite, README review, `git diff` inspection |

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `sync-agents.sh` | Sole maintained script with internal functions for mirror sync, skill generation, runtime install, and global rules installation | Modify |
| `README.md` | Document the single-script workflow and remove references to deleted maintenance scripts | Modify |
| `tests/test-agent-skills-import.sh` | Verify consolidated sync imports a unique Addy skill | Modify |
| `tests/test-agent-skills-priority.sh` | Verify consolidated sync keeps Superpowers on collisions | Modify |
| `tests/test-sync-agents-idempotent.sh` | Verify one-script sync is idempotent and links runtimes/global rules | Modify |
| `tests/test-update-skills-missing-upstream.sh` | Verify consolidated sync repairs missing upstream remotes via one entrypoint | Modify |
| `tests/test-claude-skills-copy-fallback.sh` | Verify consolidated sync still falls back to copy for Claude | Modify |
| `setup-agents.sh` | Redundant after consolidation | Delete |
| `setup-superpowers-fork.sh` | Redundant after consolidation | Delete |
| `update-skills.sh` | Redundant after consolidation | Delete |
| `install-global-rules.sh` | Redundant after consolidation | Delete |
| `docs/superpowers/specs/2026-06-06-single-sync-script-design.md` | Approved design reference | Reference only |
| `docs/superpowers/plans/2026-06-06-single-sync-script.md` | Implementation handoff artifact | Create |

---

### Task 1: Update the tests first so only `sync-agents.sh` is required

**Files:**
- Modify: `tests/test-agent-skills-import.sh`
- Modify: `tests/test-agent-skills-priority.sh`
- Modify: `tests/test-sync-agents-idempotent.sh`
- Modify: `tests/test-update-skills-missing-upstream.sh`
- Modify: `tests/test-claude-skills-copy-fallback.sh`

- [ ] **Step 1: Remove companion-script copies from all fixture tests**

For every listed test file:
- delete `cp` lines that copy `update-skills.sh`, `setup-superpowers-fork.sh`, `setup-agents.sh`, and `install-global-rules.sh`
- keep copying only:
  - `sync-agents.sh`
  - `README.md`
  - `.gitignore`
  - `shared/rules/global_rules.md`

- [ ] **Step 2: Route every fixture through `./sync-agents.sh`**

Ensure every listed test executes only:

```bash
HOME="$HOME_DIR" ./sync-agents.sh >/dev/null
```

or the existing Claude-fallback variant:

```bash
PATH="$FAKE_BIN:$PATH" HOME="$HOME_DIR" ./sync-agents.sh >/dev/null
```

The tests must not call `update-skills.sh` directly after this step.

- [ ] **Step 3: Add global-rules assertions to the end-to-end sync test**

In `tests/test-sync-agents-idempotent.sh`, after the existing runtime-link assertions, add:

```bash
test -L "$HOME_DIR/.codex/AGENTS.md"
test "$(readlink "$HOME_DIR/.codex/AGENTS.md")" = "$WORKDIR/shared/rules/global_rules.md"
test -L "$HOME_DIR/.claude/CLAUDE.md"
test "$(readlink "$HOME_DIR/.claude/CLAUDE.md")" = "$WORKDIR/shared/rules/global_rules.md"
```

This verifies that the consolidated no-arg sync still installs global rules.

- [ ] **Step 4: Run the updated tests to verify RED**

Run:

```bash
bash tests/test-agent-skills-import.sh
bash tests/test-agent-skills-priority.sh
bash tests/test-sync-agents-idempotent.sh
bash tests/test-update-skills-missing-upstream.sh
bash tests/test-claude-skills-copy-fallback.sh
```

Expected:
- at least the tests that previously depended on copied companion scripts fail
- the failure must be due to missing consolidated behavior in `sync-agents.sh`, not due to broken fixtures

---

### Task 2: Consolidate all maintenance logic into `sync-agents.sh`

**Files:**
- Modify: `sync-agents.sh`

- [ ] **Step 1: Expand the top-level variable block**

Ensure the script defines all paths and URLs it now owns directly:

```bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORK_DIR="$SCRIPT_DIR/superpowers-fork"
AGENT_SKILLS_FORK_DIR="$SCRIPT_DIR/agent-skills-fork"
SOURCE_DIR="$SCRIPT_DIR/superpowers-agents"
SKILLS_DIR="$SOURCE_DIR/skills"
SOURCE_RULES="$SCRIPT_DIR/shared/rules/global_rules.md"
UPSTREAM_REPO="https://github.com/obra/superpowers.git"
AGENT_SKILLS_UPSTREAM_REPO="https://github.com/addyosmani/agent-skills.git"
AGENTS_TARGET="$HOME/.agents"
CLAUDE_SKILLS_TARGET="$HOME/.claude/skills"
TIMESTAMP="$(date +%s)"
```

- [ ] **Step 2: Move runtime-link helpers into `sync-agents.sh`**

Copy in the behavior from the current `setup-agents.sh` as internal functions:
- `backup_target`
- `install_symlink`
- `install_symlink_or_copy`
- `install_runtime_paths`

`install_runtime_paths` should:
- validate `SOURCE_DIR` and `SKILLS_DIR`
- link `~/.agents`
- symlink-or-copy `~/.claude/skills`

- [ ] **Step 3: Move global-rules installation into `sync-agents.sh`**

Add an `install_global_rules` function that:
- validates `SOURCE_RULES`
- iterates over the current configured targets
- backs up existing targets before replacing them
- symlinks each target to `SOURCE_RULES`

Keep the current target list unchanged.

- [ ] **Step 4: Move mirror setup and refresh helpers into `sync-agents.sh`**

Add internal helpers equivalent to the current split behavior:
- `ensure_upstream_remote`
- `setup_mirror_repo`
- `require_repo_dir`
- `refresh_repo`
- `require_skills_source_dir`
- `copy_missing_skill_dirs`

The one-file flow must still:
- clone missing mirrors
- fetch existing mirrors
- add `upstream` remotes when absent
- reset both mirrors to `upstream/main`

- [ ] **Step 5: Add generated-tree rebuild logic into `sync-agents.sh`**

Implement a `rebuild_generated_skills` function that:
- validates both upstream `skills/` directories
- creates `superpowers-agents/skills` when missing
- clears the generated tree
- copies Superpowers skills first
- copies non-conflicting Addy skills second
- copies `custom/skills` last if present

- [ ] **Step 6: Replace wrapper flow with one sequential main path**

The end of `sync-agents.sh` should call functions in this order:

```bash
echo "Running unified agents sync..."
echo ""

ensure_rules_source_exists
setup_mirror_repo "$FORK_DIR" "$UPSTREAM_REPO" "Superpowers"
setup_mirror_repo "$AGENT_SKILLS_FORK_DIR" "$AGENT_SKILLS_UPSTREAM_REPO" "agent-skills"
refresh_repo "$FORK_DIR" "$UPSTREAM_REPO" "Superpowers"
refresh_repo "$AGENT_SKILLS_FORK_DIR" "$AGENT_SKILLS_UPSTREAM_REPO" "agent-skills"
rebuild_generated_skills
install_runtime_paths
install_global_rules

echo ""
echo "Done. Skills and global rules are up to date."
```

Where `ensure_rules_source_exists` is a small helper that fails immediately if `shared/rules/global_rules.md` is missing.

---

### Task 3: Delete the redundant companion scripts and update the docs

**Files:**
- Delete: `setup-agents.sh`
- Delete: `setup-superpowers-fork.sh`
- Delete: `update-skills.sh`
- Delete: `install-global-rules.sh`
- Modify: `README.md`

- [ ] **Step 1: Remove references to the companion scripts from the README**

Update the repository-layout and command sections so they no longer present:
- `setup-agents.sh`
- `setup-superpowers-fork.sh`
- `update-skills.sh`
- `install-global-rules.sh`

as maintained user-facing scripts.

- [ ] **Step 2: Rewrite the quick-start and daily-flow sections**

Both sections should tell the user to run only:

```bash
./sync-agents.sh
```

and explain that it now performs:
- mirror clone or refresh
- generated skill rebuild
- runtime link refresh
- global rules link refresh

- [ ] **Step 3: Delete the redundant script files**

Remove:
- `setup-agents.sh`
- `setup-superpowers-fork.sh`
- `update-skills.sh`
- `install-global-rules.sh`

The repository should retain only `sync-agents.sh` for this workflow.

---

### Task 4: Make the consolidated flow green

**Files:**
- Reference: `sync-agents.sh`
- Reference: updated tests

- [ ] **Step 1: Run the full targeted regression set**

Run:

```bash
bash tests/test-agent-skills-import.sh
bash tests/test-agent-skills-priority.sh
bash tests/test-sync-agents-idempotent.sh
bash tests/test-update-skills-missing-upstream.sh
bash tests/test-claude-skills-copy-fallback.sh
```

Expected: all PASS using only the consolidated `sync-agents.sh`.

- [ ] **Step 2: Run shell syntax verification**

Run:

```bash
bash -n sync-agents.sh tests/test-agent-skills-import.sh tests/test-agent-skills-priority.sh tests/test-sync-agents-idempotent.sh tests/test-update-skills-missing-upstream.sh tests/test-claude-skills-copy-fallback.sh
```

Expected: exit 0 with no output.

- [ ] **Step 3: Inspect the final diff for scope control**

Run:

```bash
git status --short
git diff -- sync-agents.sh README.md tests docs/superpowers/specs/2026-06-06-single-sync-script-design.md docs/superpowers/plans/2026-06-06-single-sync-script.md
```

Expected:
- only the intended script, doc, and test changes appear
- the deleted companion scripts are visible as deletions
- unrelated user changes remain untouched

## Self-Review

- Spec coverage: the plan maps the one-script entrypoint, automatic full-sync flow, merge precedence, runtime behavior, global rules behavior, doc updates, and script deletions to concrete tasks.
- Placeholder scan: there are no `TODO` or vague “handle appropriately” steps; each edit target and verification command is explicit.
- Type consistency: the plan consistently uses `sync-agents.sh`, `agent-skills-fork`, `superpowers-agents/skills`, `install_runtime_paths`, `install_global_rules`, and `rebuild_generated_skills`.
- Requirement mapping: every acceptance criterion maps to the updated fixture tests, syntax checks, or final diff inspection.

Plan complete and saved to `docs/superpowers/plans/2026-06-06-single-sync-script.md`. Default execution mode: Inline Execution in this session.
