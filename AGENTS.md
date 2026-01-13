# CodexMonitor Agent Guide

## Project Summary
CodexMonitor is a macOS Tauri app that orchestrates Codex agents across local workspaces. The frontend is **SolidJS + Vite** (rewritten from the upstream React version); the backend is a Tauri Rust process that spawns `codex app-server` per workspace and streams JSON-RPC events.

## Version Control

We use **jj (Jujutsu)** instead of git for version control. jj is built in Rust and provides first-class Rust library support via the `jj-lib` crate for programmatic access.

Use `jj` commands for all VCS operations. Use the `/jujutsu` skill for jj-specific workflows.

## Build Tooling

### solid-jsx-oxc
Custom SolidJS JSX compiler built with oxc (Rust-based JS toolchain).
- Location: `/Users/new/projects/rs/solid-jsx-oxc`
- This is a local rewrite of the SolidJS compiler using oxc for faster compilation
- **If you encounter compiler bugs, fix them in this library directly**
- Note: `vite.config.ts` currently uses `vite-plugin-solid` while `solid-jsx-oxc` is being refactored/stabilized.

## UI Libraries

### Corvu
Unstyled, accessible UI primitives for SolidJS.
- Docs: https://corvu.dev/docs/primitives
- Use corvu components for dialogs, popovers, tooltips, and other interactive UI elements

### Kobalte
Accessible UI primitives for SolidJS.
- Docs: https://kobalte.dev/docs/core/overview/introduction/
- Use Kobalte components (e.g. combobox, tabs, dialogs) when Corvu isn’t a fit or when upstream patterns rely on it

### Solid Primitives
Collection of high-quality primitives for SolidJS.
- Docs: https://primitives.solidjs.community
- Use for utilities like storage, event listeners, resize observers, and other reactive helpers

## SolidJS Guidelines

If unsure about SolidJS patterns or best practices, use the `/solidjs` skill for guidance on:
- Reactive primitives (`createSignal`, `createMemo`, `createEffect`)
- Control flow components (`<Show>`, `<For>`, `<Switch>`)
- Store management
- Component patterns

## Key Paths

- `src/App.tsx`: composition root
- `src/components/`: presentational UI components
- `src/stores/`: reactive stores + event wiring
- `src/services/tauri.ts`: Tauri IPC wrapper
- `src/styles/`: split CSS by area
- `src/types.ts`: shared types
- `src-tauri/src/lib.rs`: backend app-server client
- `src-tauri/tauri.conf.json`: window config + effects

## Architecture Guidelines

- **Composition root**: keep orchestration in `src/App.tsx`; avoid logic in components.
- **Components**: presentational only; props in, UI out; no Tauri IPC calls.
- **Stores**: own reactive state, side-effects, and event wiring (e.g., app-server events).
- **Services**: all Tauri IPC goes through `src/services/tauri.ts`.
- **Types**: shared UI data types live in `src/types.ts`.
- **Styles**: one CSS file per UI area in `src/styles/` (no global refactors in components).
- **Backend IPC**: add new commands in `src-tauri/src/lib.rs` and mirror them in the service.
- **App-server protocol**: do not send any requests before `initialize/initialized`.

## App-Server Flow

- Backend spawns `codex app-server` using the `codex` binary.
- Initializes with `initialize` request and `initialized` notification.
- Streams JSON-RPC notifications over stdout; request/response pairs use `id`.
- Approval requests arrive as server-initiated JSON-RPC requests.
- Threads are fetched via `thread/list`, filtered by `cwd`, and resumed via `thread/resume` when selected.
- Archiving uses `thread/archive` and removes the thread from the UI list.

## Workspace Persistence

- Workspaces are stored in `workspaces.json` under the app data directory.
- `list_workspaces` returns saved items; `add_workspace` persists and spawns a session.
- On launch, the app connects each workspace once and loads its thread list.
  - `src/App.tsx` guards this with a `Set` to avoid connect/list loops.

## Running Locally

```bash
bun install
bun run tauri dev
```

## Common Changes

- UI layout or styling: update `src/components/*` and `src/styles/*`.
- App-server event handling: edit `src/stores/appServerEvents.ts`.
- Tauri IPC: add wrappers in `src/services/tauri.ts` and implement in `src-tauri/src/lib.rs`.
- VCS status/log: `src/stores/vcsStatus.ts` + `src/stores/vcsLog.ts` and `src-tauri/src/lib.rs` (jj via `jj-lib`).
- Thread history rendering: thread stores convert `thread/resume` turns into UI items.
  - Thread names update on first user message (preview-based), and on resume if a preview exists.

## Notes

- The window uses `titleBarStyle: "Overlay"` and macOS private APIs for transparency.
- Avoid breaking the JSON-RPC format; app-server rejects requests before initialization.
- The debug panel is UI-only; it logs client/server/app-server events from `appServerEvents` store.
