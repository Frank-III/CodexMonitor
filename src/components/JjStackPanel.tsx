import { createMemo, createSignal, For, Show } from "solid-js";
import type { WorktreeDivergence, WorkspaceInfo } from "../types";
import type { WorktreeStackOpState } from "../stores/worktreeStackOps";

type DivergenceEntry = {
  data?: WorktreeDivergence;
  isLoading: boolean;
  error: string | null;
};

type StackRow = {
  workspace: WorkspaceInfo;
  depth: number;
};

type JjStackPanelProps = {
  root: WorkspaceInfo | null;
  rows: StackRow[];
  activeWorkspaceId: string | null;
  stackOp?: WorktreeStackOpState | null;
  onClearStackOp?: () => void;
  divergenceByWorkspaceId: Record<string, DivergenceEntry | undefined>;
  descendantCountByWorkspaceId: Record<string, number | undefined>;
  onRefresh: () => void;
  onSelectWorkspace: (workspaceId: string) => void;
  onEditBaseRevset: (workspaceId: string) => void;
  onReparentWorktree: (workspaceId: string) => void;
  onSyncWorktree: (workspaceId: string) => void;
  onSyncWorktreeStack: (workspaceId: string) => void;
  onLandWorktree: (workspaceId: string) => void;
  onLandWorktreeStack: (workspaceId: string) => void;
};

export function JjStackPanel(props: JjStackPanelProps) {
  const [menuOpenId, setMenuOpenId] = createSignal<string | null>(null);
  const stackOp = () => props.stackOp ?? null;
  const stackOpSummary = createMemo(() => {
    const op = stackOp();
    if (!op) {
      return null;
    }
    const verb = op.action === "sync" ? "Sync" : "Land";
    const label = op.running ? `${verb}ing` : op.ok === true ? `${verb}ed` : op.ok === false ? `${verb} failed` : verb;
    return {
      label,
      completed: op.completed,
      total: op.total,
      running: op.running,
      ok: op.ok,
      error: op.error,
    };
  });

  return (
    <aside class="stack-panel">
      <div class="stack-header">
        <div class="stack-header-left">
          <span>JJ Stack</span>
          <Show when={props.root}>
            {(root) => <span class="stack-header-meta">{root().name}</span>}
          </Show>
        </div>
        <div class="stack-header-right">
          <Show when={stackOpSummary()}>
            {(summary) => (
              <div class="stack-op-summary">
                <span
                  class="stack-op-pill"
                  classList={{
                    "is-running": summary().running,
                    "is-success": !summary().running && summary().ok === true,
                    "is-error": !summary().running && summary().ok === false,
                  }}
                  title={
                    summary().error ??
                    `${summary().label} ${summary().completed}/${summary().total}`
                  }
                >
                  {summary().label} <span class="stack-op-count">{summary().completed}/{summary().total}</span>
                </span>
                <Show when={!summary().running && !!props.onClearStackOp}>
                  <button
                    type="button"
                    class="ghost stack-op-clear"
                    onClick={() => props.onClearStackOp?.()}
                    aria-label="Clear stack operation"
                    title="Clear"
                  >
                    ×
                  </button>
                </Show>
              </div>
            )}
          </Show>
          <button
            type="button"
            class="ghost issues-refresh"
            onClick={props.onRefresh}
            aria-label="Refresh stack"
            title="Refresh"
          >
            ↻
          </button>
        </div>
      </div>

      <Show when={stackOp()?.error}>
        <div class="stack-op-error">{stackOp()?.error}</div>
      </Show>

      <Show when={props.root} fallback={<div class="stack-empty">Select a workspace.</div>}>
        <Show when={props.rows.length} fallback={<div class="stack-empty">No worktrees.</div>}>
          <div class="stack-list">
            <For each={props.rows}>
              {(row) => {
                const workspace = () => row.workspace;
                const isActive = () => props.activeWorkspaceId === workspace().id;
                const divergenceEntry = () => props.divergenceByWorkspaceId[workspace().id];
                const descendantCount = () =>
                  props.descendantCountByWorkspaceId[workspace().id] ?? 0;
                const behindCount = () => divergenceEntry()?.data?.behind ?? 0;
                const stepState = () =>
                  stackOp()?.steps_by_workspace_id[workspace().id] ?? null;

                return (
                  <div
                    class="stack-row"
                    classList={{ active: isActive() }}
                    style={{ "padding-left": `${Math.max(0, row.depth) * 14}px` }}
                    role="button"
                    tabIndex={0}
                    onClick={() => props.onSelectWorkspace(workspace().id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        props.onSelectWorkspace(workspace().id);
                      }
                    }}
                  >
                    <div class="stack-row-left">
                      <span class="stack-row-icon" aria-hidden>
                        ↳
                      </span>
                      <span class="stack-row-name">{workspace().name}</span>
                      <Show when={descendantCount() > 0}>
                        <span
                          class="stack-row-badge"
                          title={`${descendantCount()} downstream worktree${descendantCount() === 1 ? "" : "s"}`}
                        >
                          +{descendantCount()}
                        </span>
                      </Show>
                    </div>

                    <div class="stack-row-right">
                      <Show when={stepState()}>
                        {(step) => (
                          <span
                            class="stack-op-dot"
                            classList={{
                              "is-pending": step().status === "pending",
                              "is-running": step().status === "running",
                              "is-success": step().status === "success",
                              "is-error": step().status === "error",
                            }}
                            title={
                              step().status === "error"
                                ? step().message ?? "Error"
                                : `${step().status} (${step().index}/${step().total})`
                            }
                            aria-label={`Stack operation status: ${step().status}`}
                          />
                        )}
                      </Show>
                      <Show when={divergenceEntry()}>
                        {(div) => (
                          <span
                            class="workspace-divergence"
                            classList={{
                              "is-loading": div().isLoading,
                              "has-error": !!div().error,
                            }}
                            title={
                              div().error
                                ? String(div().error)
                                : div().data?.base_name
                                  ? `Base: ${div().data!.base_name} @ ${div().data!.base_revset}`
                                  : "Workspace divergence"
                            }
                          >
                            <Show
                              when={div().data}
                              fallback={
                                <span class="workspace-divergence-placeholder" aria-hidden>
                                  {div().error ? "!" : div().isLoading ? "…" : ""}
                                </span>
                              }
                            >
                              {(data) => (
                                <>
                                  <span class="workspace-divergence-ahead">+{data().ahead}</span>
                                  <span class="workspace-divergence-behind">-{data().behind}</span>
                                </>
                              )}
                            </Show>
                          </span>
                        )}
                      </Show>

                      <Show when={behindCount() > 0}>
                        <button
                          type="button"
                          class="workspace-sync"
                          onClick={(event) => {
                            event.stopPropagation();
                            props.onSyncWorktree(workspace().id);
                          }}
                          aria-label="Sync with parent"
                          title={`Sync with parent (behind ${behindCount()})`}
                        >
                          <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                            <path
                              d="M20 12a8 8 0 1 1-2.34-5.66M20 4v6h-6"
                              stroke="currentColor"
                              stroke-width="1.6"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                            />
                          </svg>
                        </button>
                      </Show>

                      <div class="thread-menu">
                        <button
                          type="button"
                          class="thread-menu-trigger"
                          aria-label="Worktree actions"
                          onMouseDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            setMenuOpenId((prev) => (prev === workspace().id ? null : workspace().id));
                          }}
                        >
                          ...
                        </button>
                        <Show when={menuOpenId() === workspace().id}>
                          <div class="thread-menu-popup" onClick={(event) => event.stopPropagation()}>
                            <button
                              class="thread-menu-item"
                              onClick={() => {
                                props.onEditBaseRevset(workspace().id);
                                setMenuOpenId(null);
                              }}
                            >
                              Edit base revset…
                            </button>
                            <button
                              class="thread-menu-item"
                              onClick={() => {
                                props.onReparentWorktree(workspace().id);
                                setMenuOpenId(null);
                              }}
                            >
                              Reparent / restack…
                            </button>
                            <button
                              class="thread-menu-item"
                              onClick={() => {
                                props.onSyncWorktree(workspace().id);
                                setMenuOpenId(null);
                              }}
                            >
                              {`Sync with parent…${behindCount() > 0 ? ` (behind ${behindCount()})` : ""}`}
                            </button>
                            <Show when={descendantCount() > 0}>
                              <button
                                class="thread-menu-item"
                                onClick={() => {
                                  props.onSyncWorktreeStack(workspace().id);
                                  setMenuOpenId(null);
                                }}
                              >
                                {`Sync stack… (+${descendantCount()})`}
                              </button>
                            </Show>
                            <button
                              class="thread-menu-item destructive"
                              onClick={() => {
                                props.onLandWorktree(workspace().id);
                                setMenuOpenId(null);
                              }}
                            >
                              Land into parent…
                            </button>
                            <Show when={descendantCount() > 0}>
                              <button
                                class="thread-menu-item destructive"
                                onClick={() => {
                                  props.onLandWorktreeStack(workspace().id);
                                  setMenuOpenId(null);
                                }}
                              >
                                {`Land stack… (+${descendantCount()})`}
                              </button>
                            </Show>
                          </div>
                        </Show>
                      </div>
                    </div>
                  </div>
                );
              }}
            </For>
          </div>
        </Show>
      </Show>
    </aside>
  );
}
