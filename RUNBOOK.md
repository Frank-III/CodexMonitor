# CodexMonitor Runbook: JJ Repo Edition

A practical guide for using CodexMonitor with JJ (Jujutsu) repositories.

---

## Prerequisites

```bash
# Verify JJ is set up
jj --version
jj status  # run in your repo
```

CodexMonitor worktrees require a JJ workspace (a `.jj/` directory at the repo root).

If your repo is Git-only today:
```bash
cd ~/your-project
jj git init --colocate  # creates JJ on top of existing Git
```

If you need to clone a remote:
```bash
jj git clone <repo-url> <dest>
```

---

## Terminology

| CodexMonitor Term | What it actually is | Git equivalent |
|-------------------|---------------------|----------------|
| **Workspace** | A project directory you add to the app | Just "a repo you opened" |
| **Worktree** | A JJ workspace (`jj workspace add`) | `git worktree add` |
| **Thread** | A Codex conversation | Chat session |
| **Turn** | One assistant response cycle | Single response |

---

## Part 1: Getting Started

### Step 1: Add Your Repo as a Workspace

1. Open CodexMonitor
2. Click **"Add Workspace"** in left sidebar
3. Select your JJ repo folder
4. App spawns a `codex app-server` for this workspace

**What happens:**
- Workspace appears in sidebar
- If `codexmonitor.setup.json` or `package.json` has setup script → runs automatically
- Thread list loads (empty for new workspace)

### Step 2: Start Your First Thread

1. Click **"New Thread"** (or `+` button)
2. Configure composer:
   - **Model**: Pick your model
   - **Access**: Start with `read-only` to explore, `full-access` to code
   - **Approval**: `on-request` is safest for learning

3. Ask the agent something:
   ```
   What's the structure of this codebase?
   ```

---

## Part 2: Core Workflow (No Worktrees)

This is the simplest flow - agent works directly in your repo.

### Chatting with the Agent

```
You: @src/main.ts explain this file

You: Add error handling to the fetchData function

You: !bun test   ← runs as shell task, not chat
```

### Composer Controls

| Control | Options | Notes |
|---------|---------|-------|
| **Model** | Various models | Pick based on task complexity |
| **Access** | `read-only` / `current` / `full-access` | Start restrictive, open up as needed |
| **Approval** | `on-request` / `never` / `unless-allow-listed` | `on-request` is safest |

### Composer Shortcuts

| Input | Action |
|-------|--------|
| `@path/to/file` | Attach file context |
| `@path/to/dir/` | Attach directory context |
| `$skill-name` | Use a skill |
| `/prompts` | Open prompts browser |
| `!command` | Run shell command (not chat) |

### Watching Changes

Use the **right panel tabs**:

| Tab | What to check |
|-----|---------------|
| **Diff** | See uncommitted changes (`jj status` equivalent) |
| **Graph** | Visual commit history |
| **Files** | Browse/search files |
| **Terminal (bottom panel)** | Run commands directly (toggle with <kbd>Ctrl</kbd>+<kbd>`</kbd>) |

### After Agent Makes Changes

In JJ, your working directory IS a commit (`@`). Changes are auto-snapshotted.

**To keep changes:**
```bash
# In Terminal tab or external terminal
jj describe -m "Add error handling to fetchData"
jj new  # start fresh commit for next task
```

**To discard:**
```bash
jj restore  # reset working copy to parent
```

### JJ Safety Net: Undo Almost Anything (Operations Log)

If you ever land/sync/reparent and regret it, JJ can usually roll back via the **operations log**:

```bash
jj op log --limit 20
jj op restore <op-id>
```

Notes:
- This rewrites the repo state back to a previous operation (think “time machine for repo metadata”).
- It won’t resurrect a deleted directory on disk (e.g. a landed worktree folder), but it can restore the underlying repo history/state.

### Shaping a Change Before You Land It (JJ-native)

Work in small, reviewable units. The common “shape” tools:

```bash
jj describe -m "Message for this change"  # name the current change (@)
jj split                                 # split a big change into smaller ones
jj squash                                # fold changes together
jj abandon @                             # drop a change entirely (use with care)
```

---

## Part 3: Using Worktrees (Agent Isolation)

Use this when you want the agent to work without touching your main checkout.

### When to Use Worktrees

| Scenario | Use Worktree? |
|----------|---------------|
| Quick fix, low risk | No - work in main |
| Experimental/risky changes | Yes - fork mode |
| Building on current work | Yes - stack mode |
| Multiple agents in parallel | Yes - each gets own worktree |
| Long-running dev server needed | Yes - separate checkout |

### Create a Worktree

1. Right-click workspace → **"New Worktree"**
2. Choose mode:
   - **Fork**: Independent branch from `@-` (parent)
   - **Stack**: Builds on `@` (current commit)
3. Name it (e.g., `agent-refactor`)
4. Optionally override base revset

**What happens:**
- Creates a JJ workspace under a CodexMonitor-managed directory (app data)
- New workspace appears nested under parent in sidebar
- Agent works there, your main checkout is untouched

### Fork vs Stack

| Mode | Base Revset | Use Case |
|------|-------------|----------|
| **Fork** | `@-` (parent) | Independent features |
| **Stack** | `@` (current) | Dependent changes |

### Work in the Worktree

1. Select the worktree in sidebar
2. Start a thread, give agent a task
3. Agent codes in isolated checkout
4. Monitor via Diff/Files tabs

### Land the Worktree

When agent is done:

1. Go to **Stack** tab
2. Click **"Land"**

**What this does:**
- Computes the base commit from the configured base revset (default `@-`)
- Moves the worktree’s changes into the base workspace (squash into the base working copy)
- For stacks: lands children first (postorder), so downstream worktrees land before their base
- **Always forgets and deletes the worktree directory** after a successful land

If a land goes wrong:
```bash
jj op log --limit 20
jj op restore <op-id>
```

### Sync the Worktree

If upstream changed while agent was working:

1. **Stack** tab → **"Sync"**
2. Rebases the worktree onto its base (equivalent to `jj rebase -b @ -o <base>`)

### Reparent a Worktree

To change a worktree's base:

1. **Stack** tab → **"Reparent"**
2. Select new base workspace/revset

Before landing a worktree, make sure it’s clean of conflicts:
```bash
jj status
jj resolve   # if JJ reports conflicts
```

---

## Part 4: Right Panel Tabs

### Info Tab
- JJ/workspace summary
- Quick status overview

### Stack Tab
- Worktree actions (land, sync, reparent)
- Stack-aware controls
- Base revset management

### Diff Tab
Shows `jj status` + file diffs:
- **Modified files** with inline diff view
- Click file → opens in **Files** tab
- Review changes before committing

### Files Tab
- Search workspace files
- Open file viewer
- Binary detection + truncation for large files

### Tasks Tab
Three task types:
- **Setup**: One-time workspace prep (install deps)
- **Run**: Normal execution (dev server)
- **Spotlight**: Runs at repo root with worktree commit applied

### PR Stack Tab (ryu)
For stacked PRs via `jj-ryu`:

1. Create commits in a stack
2. **Track**: `ryu track --all` (marks `trunk()..@`)
3. **Submit**: `ryu submit` (creates chained GitHub PRs)
4. **Sync**: `ryu sync` (update from upstream)

### Issues Tab
- GitHub Issues integration (when available)
- View/manage issues for repo

### Graph Tab
Visual `jj log`:
```
○  abc123  (you) Add feature X
│
○  def456  main: Initial commit
```
- See commit relationships
- Identify where worktrees branch

### Bookmarks Tab
JJ bookmarks = Git branches
- Create/delete bookmarks
- Push to remote (`jj git push`)
- Track remote bookmarks (`jj git fetch`)

### Terminal (Bottom Panel)
- PTY terminal in the active workspace
- Toggle with <kbd>Ctrl</kbd>+<kbd>`</kbd> (or the terminal button in the top bar)
- Multiple terminals supported via tabs (+)

---

## Part 5: Common Workflows

### Workflow A: Quick Fix (No Worktree)

```
1. Select workspace
2. New thread
3. "Fix the typo in README.md"
4. Agent fixes it
5. Check Diff tab
6. In terminal: jj describe -m "Fix typo" && jj new
```

### Workflow B: Feature with Isolation

```
1. Create worktree (fork mode)
2. New thread in worktree
3. "Implement user authentication"
4. Agent works in isolation
5. Review changes in Diff tab
6. Land worktree when satisfied
```

### Workflow C: Stacked Changes

```
1. Create worktree (stack mode) from current work
2. Agent builds on your changes
3. Land to merge back
4. Repeat for next layer
```

### Workflow D: Parallel Agents

```
1. Create worktree A (fork) - "Refactor auth"
2. Create worktree B (fork) - "Add tests"
3. Each agent works independently
4. Land each when done
5. Resolve any conflicts
```

### Workflow E: Stacked PRs

```
1. Work in main workspace
2. Create commits: A → B → C
3. Create bookmarks for each:
   jj bookmark create feature-a
   jj new
   jj bookmark create feature-b
   ...
4. PR Stack tab → Track → Submit
5. Get chained PRs on GitHub
```

---

## Part 6: JJ Quick Reference

### Essential Commands

```bash
jj status          # what's changed (like git status)
jj diff            # show diff
jj log             # commit history
jj describe -m ""  # set commit message for @
jj new             # start new commit (like git commit && git checkout)
jj edit <rev>      # jump to revision (like git checkout)
jj restore         # discard changes (like git checkout .)
jj resolve         # resolve conflicts
jj op log          # operations log (“time machine”)
jj op restore      # restore repo state to an op
```

### Stacking Commands

```bash
jj new main        # new commit based on main
jj squash          # fold @ into parent
jj rebase -d main  # rebase onto main
jj rebase -s A -d B  # move A (and descendants) onto B
```

### Bookmark Commands

```bash
jj bookmark create name     # create bookmark at @
jj bookmark list            # list bookmarks
jj bookmark delete name     # delete bookmark
jj bookmark set name -r @   # move bookmark to @
```

### Remote Commands

```bash
jj git fetch                # fetch from remote
jj git push                 # push current bookmark
jj git push -b name         # push specific bookmark
```

### Workspace Commands

```bash
jj workspace list           # list workspaces
jj workspace add ../path    # create workspace
jj workspace forget name    # remove workspace
```

### Revset Syntax

| Revset | Meaning |
|--------|---------|
| `@` | Current commit (working copy) |
| `@-` | Parent of current |
| `@--` | Grandparent |
| `main` | Bookmark named "main" |
| `trunk()` | Main branch equivalent |
| `A..B` | Range from A to B |
| `trunk()..@` | All commits from trunk to current |
| `trunk()..@-` | Same, but excludes the working-copy commit (`@`) |
| `@-..@` | The current working-copy change (often “what you’re doing now”) |

---

## Part 7: Troubleshooting

### Workspace Won't Connect
1. Check Debug Panel for errors
2. Verify JJ repo: `jj status` in terminal
3. Check codex is installed: `codex --version`
4. Try `codex doctor` in Terminal tab

### Worktree Conflicts
1. Use **Sync** to pull upstream changes
2. Check base revset in Stack tab
3. Manually resolve in terminal:
   ```bash
   jj resolve  # interactive conflict resolution
   ```

### I Landed / Synced the Wrong Thing
1. In the workspace where you ran the action, open Terminal
2. Find the last good state:
   ```bash
   jj op log --limit 20
   ```
3. Restore it:
   ```bash
   jj op restore <op-id>
   ```
Note: if a landed worktree directory was deleted, you may need to recreate it (the repo state can still be restored).

### Task Not Running
1. Check workspace settings for command override
2. Verify `codexmonitor.setup.json` exists and is valid JSON
3. Check `package.json` for scripts
4. Look at Tasks tab output for errors

### Agent Not Responding
1. Check thread is selected
2. Verify workspace is connected (check sidebar icon)
3. Check Debug Panel for IPC errors
4. Try creating new thread

### Changes Not Showing in Diff
1. JJ auto-snapshots, but UI may need refresh
2. Run `jj status` in Terminal to verify
3. Check you're looking at correct workspace

---

## Part 8: Decision Trees

### Should I Use a Worktree?

```
Is the task quick and low-risk?
├─ Yes → Work in main workspace
└─ No
   ├─ Do I need isolation? → Create worktree (fork)
   ├─ Building on current? → Create worktree (stack)
   └─ Multiple agents? → Create multiple worktrees
```

### What Access Mode?

```
What's the agent doing?
├─ Exploring/explaining → read-only
├─ Modifying current directory → current
└─ Needs full repo access → full-access
```

### What Approval Mode?

```
How much do I trust this task?
├─ Learning/experimenting → on-request (safest)
├─ Known patterns → unless-allow-listed
└─ I'll review after → never (review in Diff tab)
```

### Done with Agent Work?

```
Are changes in main workspace?
├─ Keep → jj describe -m "..." && jj new
└─ Discard → jj restore

Are changes in worktree?
├─ Keep → Land worktree
├─ Discard → Delete worktree
└─ Not ready → Leave it, come back later
```

---

## Part 9: Tips & Best Practices

### General
- Start with `read-only` access to explore, then open up
- Use `on-request` approval until you trust the workflow
- Check Diff tab before landing/committing
- Use meaningful commit messages with `jj describe`

### Worktrees
- Name worktrees descriptively: `agent-auth-refactor`
- Don't let worktrees pile up - land or delete when done
- Use fork mode for unrelated features
- Use stack mode for dependent changes

### JJ Hygiene
- Run `jj new` after each logical unit of work
- Use bookmarks for important commits
- Keep `trunk()..@` clean for PR stacks
- Regularly `jj git fetch` to stay in sync

### Performance
- Archive old threads to keep sidebar clean
- Delete landed worktrees
- Use Tasks tab for long-running processes

---

## Appendix: Configuration Files

### codexmonitor.setup.json
```json
{
  "setupCommand": "bun install",
  "runCommand": "bun run dev",
  "spotlightCommand": "bun test"
}
```

### Alternative: package.json
```json
{
  "scripts": {
    "setup": "bun install"
  },
  "codexMonitor": {
    "setupCommand": "bun install && bun run build"
  }
}
```

### Settings Location
- App settings: `settings.json` in app data directory
- Workspaces: `workspaces.json` in app data directory
- UI state: localStorage in the app

---

## Quick Start Checklist

- [ ] JJ installed and working (`jj --version`)
- [ ] Repo is JJ-managed (`jj status` works)
- [ ] Codex installed (`codex --version`)
- [ ] Added workspace to CodexMonitor
- [ ] Created first thread
- [ ] Explored right panel tabs
- [ ] Made first change with agent
- [ ] Committed with `jj describe && jj new`
