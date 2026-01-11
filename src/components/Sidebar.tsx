import { createSignal, For, Show, type Accessor } from "solid-js";
import type { ThreadSummary, WorkspaceInfo } from "../types";

type SidebarProps = {
  workspaces: Accessor<WorkspaceInfo[]>;
  threadsByWorkspace: Accessor<Record<string, ThreadSummary[]>>;
  threadStatusById: Accessor<Record<string, { isProcessing: boolean; hasUnread: boolean }>>;
  activeWorkspaceId: Accessor<string | null>;
  activeThreadId: Accessor<string | null>;
  onAddWorkspace: () => void;
  onSelectWorkspace: (id: string | null) => void;
  onConnectWorkspace: (workspace: WorkspaceInfo) => void;
  onAddAgent: (workspace: WorkspaceInfo) => void;
  onSelectThread: (workspaceId: string, threadId: string) => void;
  onDeleteThread: (workspaceId: string, threadId: string) => void;
};

export function Sidebar(props: SidebarProps) {
  const [menuOpen, setMenuOpen] = createSignal<string | null>(null);
  const [expandedWorkspaces, setExpandedWorkspaces] = createSignal(
    new Set<string>()
  );

  return (
    <aside class="sidebar">
      <div class="sidebar-header">
        <div>
          <div class="subtitle">Workspaces</div>
        </div>
        <button
          class="ghost workspace-add"
          onClick={props.onAddWorkspace}
          data-tauri-drag-region="false"
          aria-label="Add workspace"
        >
          +
        </button>
      </div>
      <div class="workspace-list">
        <For each={props.workspaces()}>
          {(entry) => (
            <div class="workspace-card">
              <div
                class={`workspace-row ${
                  entry.id === props.activeWorkspaceId() ? "active" : ""
                }`}
                role="button"
                tabIndex={0}
                onClick={() => props.onSelectWorkspace(entry.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    props.onSelectWorkspace(entry.id);
                  }
                }}
              >
                <div>
                  <div class="workspace-name-row">
                    <span class="workspace-name">{entry.name}</span>
                    <button
                      class="ghost workspace-add"
                      onClick={(event) => {
                        event.stopPropagation();
                        props.onAddAgent(entry);
                      }}
                      data-tauri-drag-region="false"
                      aria-label="Add agent"
                    >
                      +
                    </button>
                  </div>
                </div>
                <Show when={!entry.connected}>
                  <span
                    class="connect"
                    onClick={(event) => {
                      event.stopPropagation();
                      props.onConnectWorkspace(entry);
                    }}
                  >
                    connect
                  </span>
                </Show>
              </div>
              <Show when={(props.threadsByWorkspace()[entry.id] ?? []).length > 0}>
                <div class="thread-list">
                  <For
                    each={
                      expandedWorkspaces().has(entry.id)
                        ? props.threadsByWorkspace()[entry.id] ?? []
                        : (props.threadsByWorkspace()[entry.id] ?? []).slice(0, 3)
                    }
                  >
                    {(thread) => (
                      <div
                        class={`thread-row ${
                          entry.id === props.activeWorkspaceId() &&
                          thread.id === props.activeThreadId()
                            ? "active"
                            : ""
                        }`}
                        onClick={() => props.onSelectThread(entry.id, thread.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            props.onSelectThread(entry.id, thread.id);
                          }
                        }}
                      >
                        <span
                          class={`thread-status ${
                            props.threadStatusById()[thread.id]?.isProcessing
                              ? "processing"
                              : props.threadStatusById()[thread.id]?.hasUnread
                                ? "unread"
                                : "ready"
                          }`}
                          aria-hidden
                        />
                        <span class="thread-name">{thread.name}</span>
                        <div class="thread-menu">
                          <button
                            class="thread-menu-trigger"
                            aria-label="Thread menu"
                            onMouseDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                              event.stopPropagation();
                              setMenuOpen((prev) =>
                                prev === thread.id ? null : thread.id
                              );
                            }}
                          >
                            ...
                          </button>
                          <Show when={menuOpen() === thread.id}>
                            <div class="thread-menu-popup">
                              <button
                                class="thread-menu-item"
                                onClick={() => {
                                  props.onDeleteThread(entry.id, thread.id);
                                  setMenuOpen(null);
                                }}
                              >
                                Archive
                              </button>
                            </div>
                          </Show>
                        </div>
                      </div>
                    )}
                  </For>
                  <Show when={(props.threadsByWorkspace()[entry.id] ?? []).length > 3}>
                    <button
                      class="thread-more"
                      onClick={(event) => {
                        event.stopPropagation();
                        setExpandedWorkspaces((prev) => {
                          const next = new Set(prev);
                          if (next.has(entry.id)) {
                            next.delete(entry.id);
                          } else {
                            next.add(entry.id);
                          }
                          return next;
                        });
                      }}
                    >
                      {expandedWorkspaces().has(entry.id)
                        ? "Show less"
                        : `${(props.threadsByWorkspace()[entry.id] ?? []).length - 3} more...`}
                    </button>
                  </Show>
                </div>
              </Show>
            </div>
          )}
        </For>
        <Show when={!props.workspaces().length}>
          <div class="empty">Add a workspace to start.</div>
        </Show>
      </div>
    </aside>
  );
}
