# CodexMonitor Spec (JJ-first)

CodexMonitor is a macOS Tauri desktop app for orchestrating Codex agents across local workspaces. The frontend is **SolidJS + Vite**; the backend is a **Rust Tauri** process that spawns one `codex app-server` per workspace and streams JSON-RPC events.

This document describes the **current** user-facing capabilities and the current backend IPC surface, plus a short upstream parity checklist.

## Core Concepts

- **Workspace (main)**: A persisted project root (directory) that gets a dedicated `codex app-server` session.
- **Worktree (JJ workspace)**: A JJ `workspace add` checkout created under an app-managed directory, linked to a parent workspace.
  - **Fork**: defaults to `@-` (parent) as base revset.
  - **Stack**: defaults to `@` (current) as base revset.
- **Thread**: A Codex conversation thread for a workspace; selecting a thread always does `thread/resume`.
- **Turn**: One assistant response cycle; can emit reasoning/tool/diff items and server-initiated approval requests.

## UI Layout

- **Left Sidebar**
  - Workspace list (main + worktrees grouped under their parent).
  - Thread list per workspace.
  - Quick workspace actions (create worktree, land/sync, settings, etc.).
- **Main View**
  - Header (workspace + thread controls).
  - Message timeline (assistant/user, tool cards, diffs).
  - Composer (model/effort/access/approval controls + autocomplete + attachments).
- **Right Panel Tabs**
  - `Info`: JJ/workspace summary.
  - `Stack`: JJ stack/worktree actions and stack-aware controls.
  - `Diff`: JJ status + file diffs.
  - `Files`: file search + file viewer.
  - `Tasks`: setup/run/spotlight runners with streamed output.
  - `PR Stack`: stacked PR workflow via `ryu` (jj-ryu).
  - `Issues`: GitHub Issues panel (when available).
  - `Graph`: JJ graph view.
  - `Bookmarks`: JJ bookmark management + git remote actions.
- **Bottom Terminal Panel**: workspace PTY terminal (tabs + resize).
- **Plan Panel**: shows per-turn plan updates (if the agent emits them).
- **Debug Panel**: event log (client/server/app-server) with clipboard export.

Panels are resizable and persisted via localStorage.

On compact layouts (≤960px), the app switches to a tabbed single-pane layout (`CompactNav`) with `workspaces | chat | panel` tabs.

## Workspace Lifecycle

### Add / Clone

- Add a workspace via folder picker.
- Clone a repository from the app (uses `jj git clone`) then add as a workspace.
- Workspaces persist in `workspaces.json` under the app data directory.
- On launch, the app connects each workspace once and loads its thread list (guarded to avoid loops).

### Workspace Setup / Run / Spotlight

Each workspace can define commands for:

- **Setup**: run once (or ad-hoc) to prepare a workspace (install deps, symlink env files, etc).
- **Run**: run the workspace normally (usually in the worktree directory).
- **Spotlight**: run against the **repo root** by temporarily applying the worktree’s commit (useful for monorepos).

Command resolution (highest → lowest):

1. Workspace settings override.
2. `codexmonitor.setup.json` / `codexmonitor.json` / `.codexmonitor.json` (repo-root config).
3. `package.json` (`scripts.setup` and/or `codexMonitor.setupCommand` keys, depending on repo config).

When a **new workspace or worktree** is created, the backend will automatically start the Setup task if a setup command is found.

## Worktrees (JJ-first)

- Create a worktree from any workspace:
  - Mode: `fork` or `stack`.
  - Optional base revset override.
  - Under the hood: `jj workspace add --name <name> -r <revset> <dest>`.
- Land/sync worktrees:
  - Single worktree land and sync flows.
  - Stack-aware land and sync flows (walk the stack and apply per-worktree ops).
- Reparenting:
  - Reattach a worktree to a different base workspace (for stack organization).
- Base revset editing:
  - Set per-worktree base revset.
  - Set per-workspace base revset defaults for stacks.

## Chat / Composer

### Threads

- List threads per workspace (`thread/list`) and resume on selection (`thread/resume`).
- Start a new thread (`thread/start`) in the active workspace.
- Archive a thread (`thread/archive`) and remove it from the sidebar list.
- **Thread tabs + split view**:
  - The active workspace’s chat area shows open threads as tabs (VS Code-style).
  - Optional 2-pane split view; drag tabs to reorder and move between panes.
  - Layout is persisted per workspace in localStorage (`codexmonitor.threadLayout`).

### Sending Messages

- Send user messages to the active thread with:
  - **Model** selector.
  - **Reasoning effort** selector (when supported).
  - **Access mode** (`read-only` / `current` / `full-access`).
  - **Approval policy** (`on-request` / `never` / `unless-allow-listed`).
  - **Attachments**: image picker, drag/drop, paste-to-attach (base64 payload).

### Drafts

- The composer keeps a **per-thread draft** (text + attachments) while you switch threads/workspaces.
- Drafts are cleared after a successful send (or after queueing, when queueing is used).

### Autocomplete / Commands

- `$` skill autocomplete.
- `@` file/folder autocomplete (directory-aware).
- `/` slash commands (start-of-line only).
- `!` shell prefix (sent as a shell task instead of a chat message).

### Prompts Browser

- `/prompts` opens a searchable prompts browser.
- Selecting a prompt inserts its content into the composer.
- Prompts are discovered from `$CODEX_HOME/prompts` (or `~/.codex/prompts`). If a workspace uses a legacy `.codexmonitor/` Codex home, prompts are loaded from `.codexmonitor/prompts` instead.
- Prompts support optional frontmatter (`description`, `argument-hint`) delimited by `---`.

### Steer Mode (Experimental)

When **Steer mode** is enabled in Settings:

- You can send a message while the agent is still processing.
- Press <kbd>Tab</kbd> while the agent is running to **queue** instead.

### Approvals

- Server-initiated approval requests show as toast prompts.
- Decisions are sent back via `respond_to_server_request`.

## Files

### File Viewer

- Search workspace files and open a file in the right panel.
- Binary detection + truncation safeguards (large files).
- Tool cards containing file changes can link directly into the file viewer.

### `@path` Mentions in Messages

The Markdown renderer detects `@path/to/file` and `@path/to/dir/` patterns in text nodes and renders them as interactive chips:

- **Hover file**: shows a small content preview (first ~48KB / ~18 lines).
- **Hover folder**: shows a small tree preview (depth-limited).
- **Click file**: opens the file in the Files panel.

## Terminal

- Bottom terminal panel backed by a Rust PTY.
- Multiple terminals via tabs (per workspace).
- Session open/write/resize/close over Tauri IPC.

## VCS (JJ)

VCS surfaces are JJ-first (via `jj-lib`) and include:

- Status/diff stats.
- File diff view.
- Log / graph browsing.
- Bookmark management and remote bookmark tracking.
- Git remote actions (`jj git fetch` and push helpers) for repos using JJ’s git backend.

### PR Stacks (jj-ryu)

CodexMonitor can optionally integrate with `jj-ryu` (the `ryu` binary) to submit **stacked pull requests** from JJ bookmark stacks:

- View the current stack (`ryu`).
- Track bookmarks in `trunk()..@` (`ryu track --all`).
- Submit tracked bookmarks as chained PRs (`ryu submit`).
- Sync stacks (`ryu sync`).
- Auth checks for GitHub/GitLab (`ryu auth ... test`).

Output is streamed via the existing `workspace-task-event` mechanism (task name: `ryu`).

## Persistence

- App settings: `settings.json` under app data directory (Codex path, default access mode, UI scale).
- Workspaces: `workspaces.json` under app data directory.
- UI state: localStorage keys (panel sizes, etc).

## Tauri IPC Surface (Current)

High-level groups (see `src/services/tauri.ts` and `src-tauri/src/lib.rs`):

- Workspaces: `list_workspaces`, `add_workspace`, `clone_repository`, `connect_workspace`, `remove_workspace`, `update_workspace_settings`
- Worktrees (JJ): `add_worktree`, `land_worktree`, `sync_worktree`, `land_worktree_stack`, `sync_worktree_stack`, `reparent_worktree`, `get_worktree_divergence`, `update_worktree_base_revset`, `update_workspace_base_revset`
- Codex: `start_thread`, `list_threads`, `resume_thread`, `archive_thread`, `send_user_message`, `turn_interrupt`, `respond_to_server_request`, `skills_list`, `model_list`, `codex_doctor`
- Files: `list_workspace_files`, `list_workspace_paths`, `list_workspace_dir`, `read_workspace_file_text`, `read_file_base64`
- VCS (JJ): `get_vcs_status`, `get_vcs_log`, `get_jj_graph`, `get_file_diff`, bookmark + remote helpers
- Tasks: `run_workspace_setup`, `run_workspace_run`, `run_workspace_spotlight`, `run_ryu`
- Terminal: `terminal_open`, `terminal_write`, `terminal_resize`, `terminal_close`
- Settings/logging: `get_app_settings`, `update_app_settings`, `log_frontend_error`

## Upstream Parity Notes (Dimillian/CodexMonitor v0.6.9)

Upstream is React + Git-first; this project is Solid + JJ-first, so some parity items are intentionally replaced by JJ equivalents.

Recent upstream work includes a GitHub PR list/diff panel in the right sidebar. In CodexMonitor (JJ-first), this is intentionally replaced by **bookmark stack submission** via `jj-ryu` (`PR Stack` tab).

Notable upstream features **not yet implemented** here:

- **Home dashboard** with recent agent activity / workspace summaries.
- **Review runner** (`start_review`) with review target selection and delivery modes.
- **Account rate limits / credits meter** (`account_rate_limits`).
- **In-app updater** (download/install UI).
- **Dictation / Whisper voice input** (download model, start/stop transcription).
- **Git branch list / checkout / create** (replaced by JJ-centric stack/bookmark UX here).
- **Open-in actions** (open workspace in Finder / editor, open commits on GitHub when a remote is detected).
- **Remote backend daemon POC** (a separate JSON-RPC daemon process; upstream prototype is not wired into the desktop UI yet either).

If we want parity or a “better-than-git” JJ workflow, the high-leverage next ports are typically:

- Review runner (JJ-aware targets: `@`, `trunk()`, revsets, stack ranges).
- Rate-limit / usage UX (tie into Codex account APIs).

## Roadmap (Next)

Prioritized “JJ-first” features to move beyond the Git mental model:

1. **Stack-aware sidebar/workspace rows**: show a tiny stack indicator (↳ +N), plus ahead/behind vs base revset, and quick base-revset selection.
2. **PR Stack (ryu) deep integration**: show the parsed stack structure + tracked state (not just raw output), and surface PR links after submit.
3. **Bookmark-first “review targets”**: pick a bookmark/revset range (`base..@`, `trunk()..@`, “this stack”) for review runs and diffs.
4. **Workspace automation**: richer `codexmonitor.setup.json` support (multiple named scripts, per-workspace presets, one-click rerun, errors surfaced in UI).
5. **Terminal polish**: better terminal panel UX (copy/search, resize perf) and stronger task/PTY streaming consistency.

## Reference Apps (Notes)

- **Dimillian/CodexMonitor (upstream)**: Git-first worktree agents, review runner, updater, dictation, and account usage UX; prompts are loaded from `$CODEX_HOME/prompts`.
- **21st-dev/1code**: Worktree-per-chat isolation, integrated terminal, and “agent mode” execution UX. Useful inspiration for terminal/diff UX and per-thread workspace isolation patterns.
