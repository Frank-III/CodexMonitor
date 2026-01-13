import { createSignal, createMemo, For, Show, Switch, Match, type Accessor } from "solid-js";
import type { ThreadSummary, WorkspaceInfo, WorktreeDivergence } from "../types";
import { WorkspacePreviewCard } from "./WorkspacePreviewCard";
import { Icon, IconButton, Tooltip, DropdownMenu, Spinner, Collapsible, Tag } from "../ui";
import { InlineEditor, openEditor } from "./InlineEditor";
import {
  DragDropProvider,
  DragDropSensors,
  DragOverlay,
  SortableProvider,
  createSortable,
  closestCenter,
} from "@thisbeyond/solid-dnd";
import type { DragEvent } from "@thisbeyond/solid-dnd";
import { ConstrainDragXAxis, getDraggableId } from "../utils/solid-dnd";

type WorktreeDivergenceEntry = {
  data?: WorktreeDivergence;
  isLoading: boolean;
  error: string | null;
};

type RyuSidebarSummary = {
  title: string | null;
  count: number;
  running: boolean;
  ok: boolean | null;
  needsPush: boolean;
  hasConflict: boolean;
};

type SidebarProps = {
  workspaces: Accessor<WorkspaceInfo[]>;
  threadsByWorkspace: Accessor<Record<string, ThreadSummary[]>>;
  threadStatusById: Accessor<Record<string, { isProcessing: boolean; hasUnread: boolean }>>;
  activeWorkspaceId: Accessor<string | null>;
  activeThreadId: Accessor<string | null>;
  worktreeDivergenceByWorkspaceId: Accessor<Record<string, WorktreeDivergenceEntry | undefined>>;
  worktreeDescendantCountByWorkspaceId: Accessor<Record<string, number | undefined>>;
  ryuSummaryByWorkspaceId: Accessor<Record<string, RyuSidebarSummary | undefined>>;
  jjGraphPreviewByWorkspaceId: Accessor<
    Record<string, { graph: string; isLoading: boolean; error: string | null } | undefined>
  >;
  onShowWorkspaceGraphPreview: (workspaceId: string) => void;
  onOpenStackTab: () => void;
  onOpenPrStackTab: () => void;
  onAddWorkspace: () => void;
  onOpenSettings: () => void;
  onSelectWorkspace: (id: string | null) => void;
  onConnectWorkspace: (workspace: WorkspaceInfo) => void;
  onAddAgent: (workspace: WorkspaceInfo) => void;
  onAddWorktreeAgent: (workspace: WorkspaceInfo) => void;
  onLandWorktree: (workspace: WorkspaceInfo) => void;
  onLandWorktreeStack: (workspace: WorkspaceInfo) => void;
  onReparentWorktree: (workspace: WorkspaceInfo) => void;
  onSyncWorktree: (workspace: WorkspaceInfo) => void;
  onSyncWorktreeStack: (workspace: WorkspaceInfo) => void;
  onEditWorktreeBaseRevset: (workspace: WorkspaceInfo) => void;
  onEditWorkspaceBaseRevset: (workspace: WorkspaceInfo) => void;
  onSelectThread: (workspaceId: string, threadId: string) => void;
  onForkThread: (workspaceId: string, threadId: string, threadName: string) => void;
  onForkThreadToWorktree: (workspaceId: string, threadId: string, threadName: string) => void;
  onDeleteThread: (workspaceId: string, threadId: string) => void;
  onDeleteWorkspace: (workspaceId: string) => void;
  onToggleWorkspaceCollapsed: (workspaceId: string, collapsed: boolean) => void;
  onRenameWorkspace: (workspaceId: string, newName: string) => void;
  onRenameThread: (workspaceId: string, threadId: string, newName: string) => void;
  onReorderWorkspace: (workspaceId: string, toIndex: number) => void;
};

function SortableRailWorkspace(props: {
  workspace: WorkspaceInfo;
  sidebarProps: SidebarProps;
  activeGroupId: Accessor<string | null>;
}) {
  const sortable = createSortable(props.workspace.id);
  const worktrees = createMemo(() =>
    props.sidebarProps.workspaces().filter((w) => w.kind === "worktree" && w.parent_id === props.workspace.id)
  );

  return (
    // @ts-ignore - solid-dnd directive
    <div use:sortable classList={{ "opacity-30": sortable.isActiveDraggable }}>
      <WorkspacePreviewCard
        workspace={props.workspace}
        worktrees={worktrees()}
        threadsByWorkspace={props.sidebarProps.threadsByWorkspace}
        threadStatusById={props.sidebarProps.threadStatusById}
        isActive={props.workspace.id === props.activeGroupId()}
        onSelectWorkspace={() => props.sidebarProps.onSelectWorkspace(props.workspace.id)}
        onSelectThread={props.sidebarProps.onSelectThread}
        onNewSession={() => props.sidebarProps.onAddAgent(props.workspace)}
      />
    </div>
  );
}

function RailWorkspaceDragOverlay(props: {
  activeId: Accessor<string | null>;
  workspaces: Accessor<WorkspaceInfo[]>;
}) {
  const workspace = createMemo(() => props.workspaces().find((w) => w.id === props.activeId()));

  return (
    <Show when={workspace()}>
      {(ws) => (
        <div class="rounded-lg bg-surface-base p-1 shadow-lg">
          <span
            class="flex items-center justify-center size-8 rounded-md text-14-medium font-semibold"
            style={{
              "background-color": `oklch(0.35 0.12 ${Math.abs(ws().name.split("").reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0)) % 360})`,
              color: `oklch(0.85 0.08 ${Math.abs(ws().name.split("").reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0)) % 360})`,
            }}
          >
            {ws().name.trim()[0]?.toUpperCase() ?? "?"}
          </span>
        </div>
      )}
    </Show>
  );
}

export function Sidebar(props: SidebarProps) {
  const [expandedWorkspaces, setExpandedWorkspaces] = createSignal(new Set<string>());
  const [graphPreviewWorkspaces, setGraphPreviewWorkspaces] = createSignal(new Set<string>());
  const [activeWorkspaceDragId, setActiveWorkspaceDragId] = createSignal<string | null>(null);

  type WorkspaceRow = { entry: WorkspaceInfo; depth: number };

  function handleDragStart(event: unknown) {
    const id = getDraggableId(event);
    if (id) setActiveWorkspaceDragId(id);
  }

  function handleDragEnd() {
    setActiveWorkspaceDragId(null);
  }

  function handleDragOver(event: DragEvent) {
    const { draggable, droppable } = event;
    if (!draggable || !droppable) return;
    const workspaces = railWorkspaces();
    const fromIndex = workspaces.findIndex((w) => w.id === draggable.id.toString());
    const toIndex = workspaces.findIndex((w) => w.id === droppable.id.toString());
    if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
      props.onReorderWorkspace(draggable.id.toString(), toIndex);
    }
  }

  const sortEntries = (a: WorkspaceInfo, b: WorkspaceInfo) => {
    const orderA = a.settings.sort_order ?? 0;
    const orderB = b.settings.sort_order ?? 0;
    if (orderA !== orderB) return orderA - orderB;
    return a.name.localeCompare(b.name);
  };

  const railWorkspaces = createMemo(() => {
    const entries = props.workspaces();
    return entries
      .filter((workspace) => workspace.kind === "main")
      .slice()
      .sort(sortEntries);
  });

  const activeGroupId = createMemo(() => {
    const activeId = props.activeWorkspaceId();
    if (!activeId) return null;
    const active = props.workspaces().find((workspace) => workspace.id === activeId);
    if (!active) return activeId;
    if (active.kind === "main") return active.id;
    return active.parent_id ?? active.base_id ?? active.id;
  });

  const workspaceRows = createMemo<WorkspaceRow[]>(() => {
    const entries = props.workspaces();
    const mainWorkspaces = entries.filter((workspace) => workspace.kind === "main").sort(sortEntries);
    const worktrees = entries.filter((workspace) => workspace.kind === "worktree");
    const rows: WorkspaceRow[] = [];
    const visited = new Set<string>();

    const push = (entry: WorkspaceInfo, depth: number) => {
      rows.push({ entry, depth });
      visited.add(entry.id);
    };

    const walkGroup = (root: WorkspaceInfo) => {
      push(root, 0);
      const groupWorktrees = worktrees.filter((workspace) => workspace.parent_id === root.id);
      const groupIds = new Set(groupWorktrees.map((workspace) => workspace.id));
      const childrenByParent = new Map<string, WorkspaceInfo[]>();

      const pushChild = (parentId: string, child: WorkspaceInfo) => {
        const list = childrenByParent.get(parentId) ?? [];
        list.push(child);
        childrenByParent.set(parentId, list);
      };

      for (const worktree of groupWorktrees) {
        const baseId = worktree.base_id ?? null;
        const displayParent = baseId && groupIds.has(baseId) ? baseId : root.id;
        pushChild(displayParent, worktree);
      }

      for (const list of childrenByParent.values()) {
        list.sort(sortEntries);
      }

      const walk = (parentId: string, depth: number, stack: Set<string>) => {
        const children = childrenByParent.get(parentId) ?? [];
        for (const child of children) {
          if (stack.has(child.id)) continue;
          push(child, depth);
          const nextStack = new Set(stack);
          nextStack.add(child.id);
          walk(child.id, depth + 1, nextStack);
        }
      };

      walk(root.id, 1, new Set([root.id]));
    };

    for (const root of mainWorkspaces) {
      walkGroup(root);
    }

    const orphaned = entries.filter((workspace) => !visited.has(workspace.id)).sort(sortEntries);
    for (const entry of orphaned) {
      push(entry, 0);
    }

    return rows;
  });

  return (
    <aside class="flex h-full w-full flex-1 flex-row overflow-hidden border-r border-border-weak bg-bg-weak">
      {/* Rail */}
      <div class="flex w-12 flex-col items-center gap-2 border-r border-border-weaker px-1.5 pb-3 pt-10">
        <DragDropProvider
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
          collisionDetector={closestCenter}
        >
          <DragDropSensors />
          <ConstrainDragXAxis />
          <div class="flex flex-col items-center gap-2">
            <SortableProvider ids={railWorkspaces().map((w) => w.id)}>
              <For each={railWorkspaces()}>
                {(workspace) => <SortableRailWorkspace workspace={workspace} sidebarProps={props} activeGroupId={activeGroupId} />}
              </For>
            </SortableProvider>
          </div>
          <DragOverlay>
            <RailWorkspaceDragOverlay activeId={activeWorkspaceDragId} workspaces={railWorkspaces} />
          </DragOverlay>
        </DragDropProvider>
        <div class="flex-1" />
        <Tooltip placement="right" value="Settings">
          <IconButton icon="settings-gear" variant="ghost" onClick={props.onOpenSettings} />
        </Tooltip>
        <Tooltip placement="right" value="Add workspace">
          <IconButton icon="plus" variant="ghost" onClick={props.onAddWorkspace} />
        </Tooltip>
      </div>

      {/* Main */}
      <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-3 pb-3 pt-10">
        <div class="flex items-center justify-between gap-3 px-2">
          <h2 class="text-sm font-medium text-text-base">Workspaces</h2>
        </div>
        <div class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden">
          <For each={workspaceRows()}>
            {(row) => (
              <WorkspaceCard
                entry={row.entry}
                depth={row.depth}
                {...props}
                expandedWorkspaces={expandedWorkspaces}
                setExpandedWorkspaces={setExpandedWorkspaces}
                graphPreviewWorkspaces={graphPreviewWorkspaces}
                setGraphPreviewWorkspaces={setGraphPreviewWorkspaces}
              />
            )}
          </For>
          <Show when={!props.workspaces().length}>
            <div class="px-2 py-4 text-xs text-text-subtle">Add a workspace to start.</div>
          </Show>
        </div>
      </div>
    </aside>
  );
}

function WorkspaceCard(
  props: SidebarProps & {
    entry: WorkspaceInfo;
    depth: number;
    expandedWorkspaces: Accessor<Set<string>>;
    setExpandedWorkspaces: (value: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
    graphPreviewWorkspaces: Accessor<Set<string>>;
    setGraphPreviewWorkspaces: (value: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  }
) {
  const entry = () => props.entry;
  const collapsed = () => entry().settings.sidebar_collapsed ?? false;
  const open = () => !collapsed();
  const threads = () => props.threadsByWorkspace()[entry().id] ?? [];
  const active = () => entry().id === props.activeWorkspaceId();
  const divergence = () => props.worktreeDivergenceByWorkspaceId()[entry().id];
  const ryuSummary = createMemo(() =>
    entry().kind === "main" ? props.ryuSummaryByWorkspaceId()[entry().id] ?? null : null
  );
  const graphPreview = () => props.jjGraphPreviewByWorkspaceId()[entry().id];
  const isGraphPreviewOpen = () => props.graphPreviewWorkspaces().has(entry().id);
  const behindCount = () => divergence()?.data?.behind ?? 0;
  const baseRevset = createMemo(() => {
    const value = divergence()?.data?.base_revset ?? entry().base_revset ?? null;
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  });
  const stackCount = () => props.worktreeDescendantCountByWorkspaceId()[entry().id] ?? 0;
  const groupWorktreeCount = createMemo(() => {
    if (entry().kind !== "main") return 0;
    return props
      .workspaces()
      .filter((workspace) => workspace.kind === "worktree" && workspace.parent_id === entry().id).length;
  });

  const handleOpenChange = (isOpen: boolean) => {
    props.onToggleWorkspaceCollapsed(entry().id, !isOpen);
  };

  const isWorktree = () => entry().kind === "worktree";
  const isMain = () => entry().kind === "main";
  const kindLabel = () => (isWorktree() ? "worktree" : "local");

  return (
    <div style={{ "margin-left": `${Math.max(0, props.depth) * 12}px` }}>
      <Collapsible variant="ghost" open={open()} class="shrink-0" onOpenChange={handleOpenChange}>
        <div class="px-1 py-0.5">
          <div class="group/trigger relative">
            <Collapsible.Trigger
              class="flex items-center justify-between w-full pl-2 pr-16 py-1.5 rounded-md transition-colors hover:bg-surface-raised-base-hover"
              classList={{ "bg-surface-base-active": active() }}
              onClick={() => props.onSelectWorkspace(entry().id)}
            >
              <div class="flex items-center gap-1 min-w-0 flex-1">
                {/* Branch/worktree icon */}
                <div class="flex items-center justify-center shrink-0 size-6">
                  <Icon name="branch" size="small" />
                </div>

                {/* Kind label */}
                <span class="text-14-medium text-text-base shrink-0">{kindLabel()} :</span>

                {/* Name - editable on double-click */}
                <Tooltip placement="top" value={entry().name} openDelay={2000} class="min-w-0">
                  <InlineEditor
                    id={`workspace:${entry().id}`}
                    value={() => entry().name}
                    onSave={(next) => props.onRenameWorkspace(entry().id, next)}
                    class="text-14-medium text-text-base min-w-0 truncate"
                    displayClass="text-14-medium text-text-base min-w-0 truncate"
                    stopPropagation
                  />
                </Tooltip>

                {/* Stack count badge */}
                <Show when={isWorktree() && stackCount() > 0}>
                  <Tag
                    class="cursor-pointer"
                    onClick={(e: MouseEvent) => {
                      e.stopPropagation();
                      props.onSelectWorkspace(entry().id);
                      props.onOpenStackTab();
                    }}
                  >
                    +{stackCount()}
                  </Tag>
                </Show>

                {/* Worktree count for main workspace */}
                <Show when={isMain() && groupWorktreeCount() > 0}>
                  <Tag
                    class="cursor-pointer"
                    onClick={(e: MouseEvent) => {
                      e.stopPropagation();
                      props.onSelectWorkspace(entry().id);
                      props.onOpenStackTab();
                    }}
                  >
                    +{groupWorktreeCount()}
                  </Tag>
                </Show>

                {/* Collapse indicator */}
                <Icon
                  name={open() ? "chevron-down" : "chevron-right"}
                  size="small"
                  class="shrink-0 text-icon-base opacity-0 transition-opacity group-hover/trigger:opacity-100 group-focus-within/trigger:opacity-100"
                />
              </div>
            </Collapsible.Trigger>

            {/* Action buttons - positioned absolutely */}
            <div class="absolute right-1 top-1/2 -translate-y-1/2 hidden items-center gap-0.5 pointer-events-none group-hover/trigger:flex group-focus-within/trigger:flex">
              {/* Divergence badge */}
              <Show when={divergence()?.data}>
                {(data) => (
                  <button
                    type="button"
                    class="pointer-events-auto flex items-center gap-1 rounded bg-surface-inset-base px-1.5 py-0.5 font-mono text-[10px] transition-colors hover:bg-surface-raised-base-hover"
                    title={baseRevset() ? `Base: ${baseRevset()}` : "Divergence from base"}
                    onClick={(e: MouseEvent) => {
                      e.stopPropagation();
                      props.setGraphPreviewWorkspaces((prev) => {
                        const next = new Set(prev);
                        if (next.has(entry().id)) {
                          next.delete(entry().id);
                        } else {
                          next.add(entry().id);
                          props.onShowWorkspaceGraphPreview(entry().id);
                        }
                        return next;
                      });
                    }}
                  >
                    <span class="text-text-diff-add-base">+{data().ahead}</span>
                    <span class="text-text-diff-delete-base">-{data().behind}</span>
                  </button>
                )}
              </Show>

              {/* PR stack badge */}
              <Show when={ryuSummary()}>
                {(summary) => (
                  <button
                    type="button"
                    class="pointer-events-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors"
                    classList={{
                      "bg-surface-warning-base text-text-warning-strong": summary().running,
                      "bg-surface-error-base text-text-error-strong": summary().ok === false || summary().hasConflict,
                      "bg-surface-inset-base text-text-base": !summary().running && summary().ok !== false && !summary().hasConflict,
                    }}
                    title={summary().title ? `PR: ${summary().title}` : `${summary().count} PR(s)`}
                    onClick={(e: MouseEvent) => {
                      e.stopPropagation();
                      props.onSelectWorkspace(entry().id);
                      props.onOpenPrStackTab();
                    }}
                  >
                    PR {summary().count}
                  </button>
                )}
              </Show>

              {/* Sync button for worktrees behind */}
              <Show when={isWorktree() && behindCount() > 0}>
                <Tooltip placement="top" value={`Sync (behind ${behindCount()})`}>
                  <IconButton
                    icon="refresh"
                    variant="ghost"
                    class="pointer-events-auto size-6 rounded-md"
                    onClick={(e: MouseEvent) => {
                      e.stopPropagation();
                      props.onSyncWorktree(entry());
                    }}
                  />
                </Tooltip>
              </Show>

              {/* New session button */}
              <Tooltip placement="top" value="New session">
                <IconButton
                  icon="plus-small"
                  variant="ghost"
                  class="pointer-events-auto size-6 rounded-md"
                  onClick={(e: MouseEvent) => {
                    e.stopPropagation();
                    props.onAddAgent(entry());
                  }}
                />
              </Tooltip>

              {/* Workspace menu */}
              <DropdownMenu>
                <DropdownMenu.Trigger
                  as={IconButton}
                  icon="dot-grid"
                  variant="ghost"
                  class="pointer-events-auto size-6 rounded-md data-[expanded]:bg-surface-base-active"
                  onClick={(e: MouseEvent) => e.stopPropagation()}
                />
                <DropdownMenu.Portal>
                  <DropdownMenu.Content class="mt-1">
                    <DropdownMenu.Item onSelect={() => openEditor(`workspace:${entry().id}`, entry().name)}>
                      <DropdownMenu.ItemLabel>Rename…</DropdownMenu.ItemLabel>
                    </DropdownMenu.Item>
                    <Show when={isWorktree()}>
                      <DropdownMenu.Item onSelect={() => props.onEditWorktreeBaseRevset(entry())}>
                        <DropdownMenu.ItemLabel>Edit base revset…</DropdownMenu.ItemLabel>
                      </DropdownMenu.Item>
                      <DropdownMenu.Item onSelect={() => props.onReparentWorktree(entry())}>
                        <DropdownMenu.ItemLabel>Reparent / restack…</DropdownMenu.ItemLabel>
                      </DropdownMenu.Item>
                      <DropdownMenu.Item onSelect={() => props.onSyncWorktree(entry())}>
                        <DropdownMenu.ItemLabel>
                          {`Sync with parent…${behindCount() > 0 ? ` (behind ${behindCount()})` : ""}`}
                        </DropdownMenu.ItemLabel>
                      </DropdownMenu.Item>
                      <Show when={stackCount() > 0}>
                        <DropdownMenu.Item onSelect={() => props.onSyncWorktreeStack(entry())}>
                          <DropdownMenu.ItemLabel>{`Sync stack… (+${stackCount()})`}</DropdownMenu.ItemLabel>
                        </DropdownMenu.Item>
                      </Show>
                      <DropdownMenu.Separator />
                      <DropdownMenu.Item onSelect={() => props.onLandWorktree(entry())}>
                        <DropdownMenu.ItemLabel class="text-text-diff-delete-base">Land into parent…</DropdownMenu.ItemLabel>
                      </DropdownMenu.Item>
                      <Show when={stackCount() > 0}>
                        <DropdownMenu.Item onSelect={() => props.onLandWorktreeStack(entry())}>
                          <DropdownMenu.ItemLabel class="text-text-diff-delete-base">{`Land stack… (+${stackCount()})`}</DropdownMenu.ItemLabel>
                        </DropdownMenu.Item>
                      </Show>
                    </Show>
                    <Show when={isMain()}>
                      <DropdownMenu.Item onSelect={() => props.onEditWorkspaceBaseRevset(entry())}>
                        <DropdownMenu.ItemLabel>Set divergence base…</DropdownMenu.ItemLabel>
                      </DropdownMenu.Item>
                    </Show>
                    <DropdownMenu.Item onSelect={() => props.onAddWorktreeAgent(entry())}>
                      <DropdownMenu.ItemLabel>New worktree agent…</DropdownMenu.ItemLabel>
                    </DropdownMenu.Item>
                    <Show when={isMain()}>
                      <DropdownMenu.Item onSelect={() => { props.onSelectWorkspace(entry().id); props.onOpenPrStackTab(); }}>
                        <DropdownMenu.ItemLabel>PR stack…</DropdownMenu.ItemLabel>
                      </DropdownMenu.Item>
                    </Show>
                    <DropdownMenu.Separator />
                    <DropdownMenu.Item onSelect={() => props.onDeleteWorkspace(entry().id)}>
                      <DropdownMenu.ItemLabel class="text-text-diff-delete-base">Delete</DropdownMenu.ItemLabel>
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Connect badge - shown when not connected */}
        <Show when={!entry().connected}>
          <div class="px-2 pb-1">
            <button
              type="button"
              class="rounded border border-border-weak-base bg-surface-inset-base px-2 py-1 text-12-regular text-text-base transition-colors hover:bg-surface-raised-base-hover"
              onClick={() => props.onConnectWorkspace(entry())}
            >
              Connect
            </button>
          </div>
        </Show>

        {/* Graph preview */}
        <Show when={isGraphPreviewOpen()}>
          <div class="mx-2 mb-2 max-h-36 overflow-auto rounded border border-border-weak-base bg-surface-inset-base p-2 font-mono text-[10px] leading-relaxed text-text-base">
            <div class="mb-1.5 flex items-center justify-between gap-2">
              <span class="truncate text-text-weak">
                <Show when={baseRevset()} fallback="JJ graph preview">
                  {(base) => `Base: ${base()}`}
                </Show>
              </span>
              <div class="flex shrink-0 items-center gap-1">
                <IconButton
                  icon="refresh"
                  variant="ghost"
                  class="size-5"
                  onClick={() => props.onShowWorkspaceGraphPreview(entry().id)}
                  disabled={graphPreview()?.isLoading ?? false}
                />
                <button
                  type="button"
                  class="rounded bg-surface-raised-base px-1.5 py-0.5 text-[10px] text-text-base transition-colors hover:bg-surface-raised-base-hover"
                  onClick={() => {
                    if (isWorktree()) {
                      props.onEditWorktreeBaseRevset(entry());
                    } else {
                      props.onEditWorkspaceBaseRevset(entry());
                    }
                  }}
                >
                  Base…
                </button>
              </div>
            </div>
            <Show when={graphPreview()} fallback={<div class="text-text-weak">Loading graph…</div>}>
              {(preview) => (
                <>
                  <Show when={preview().isLoading}>
                    <div class="text-text-weak">Loading graph…</div>
                  </Show>
                  <Show when={!preview().isLoading && preview().error}>
                    <div class="whitespace-pre-wrap text-text-error-strong">{preview().error}</div>
                  </Show>
                  <Show when={!preview().isLoading && !preview().error}>
                    <Show when={preview().graph.trim()} fallback={<div class="text-text-weak">No graph.</div>}>
                      <pre class="m-0 whitespace-pre">{preview().graph}</pre>
                    </Show>
                  </Show>
                </>
              )}
            </Show>
          </div>
        </Show>

        {/* Thread list */}
        <Collapsible.Content>
          <nav class="flex flex-col gap-1 px-2">
            <For each={props.expandedWorkspaces().has(entry().id) ? threads() : threads().slice(0, 3)}>
              {(thread) => {
                const status = () => props.threadStatusById()[thread.id];
                const isProcessing = () => status()?.isProcessing;
                const hasUnread = () => status()?.hasUnread && !isProcessing();
                const isSelected = () => active() && thread.id === props.activeThreadId();

                return (
                  <div
                    data-session-id={thread.id}
                    class="group/thread relative w-full rounded-md cursor-default transition-colors pl-2 pr-3
                           hover:bg-surface-raised-base-hover focus-within:bg-surface-raised-base-hover"
                    classList={{ "bg-surface-base-active": isSelected() }}
                  >
                    <button
                      type="button"
                      class="flex items-center gap-1 w-full py-1 text-left focus:outline-none transition-[padding] group-hover/thread:pr-7 group-focus-within/thread:pr-7"
                      onClick={() => props.onSelectThread(entry().id, thread.id)}
                    >
                      {/* Status indicator */}
                      <div class="shrink-0 size-6 flex items-center justify-center">
                        <Switch fallback={<Icon name="dash" size="small" class="text-icon-weak" />}>
                          <Match when={isProcessing()}>
                            <Spinner class="size-[15px]" />
                          </Match>
                          <Match when={hasUnread()}>
                            <div class="size-1.5 rounded-full bg-text-interactive-base" />
                          </Match>
                        </Switch>
                      </div>
                      {/* Title - editable on double-click */}
                      <Tooltip placement="top-start" value={thread.name} openDelay={2000} class="grow-1 min-w-0">
                        <InlineEditor
                          id={`thread:${thread.id}`}
                          value={() => thread.name}
                          onSave={(next) => props.onRenameThread(entry().id, thread.id, next)}
                          class="text-14-regular text-text-strong grow-1 min-w-0 overflow-hidden text-ellipsis truncate"
                          displayClass="text-14-regular text-text-strong grow-1 min-w-0 overflow-hidden text-ellipsis truncate"
                          stopPropagation
                        />
                      </Tooltip>
                    </button>
                    {/* Thread menu */}
                    <div class="hidden group-hover/thread:flex group-focus-within/thread:flex items-center gap-0.5 absolute top-1 right-1">
                      <DropdownMenu>
                        <DropdownMenu.Trigger
                          as={IconButton}
                          icon="dot-grid"
                          variant="ghost"
                          class="size-6 rounded-md"
                          onClick={(e: MouseEvent) => e.stopPropagation()}
                        />
                        <DropdownMenu.Portal>
                          <DropdownMenu.Content class="mt-1">
                            <DropdownMenu.Item onSelect={() => openEditor(`thread:${thread.id}`, thread.name)}>
                              <DropdownMenu.ItemLabel>Rename…</DropdownMenu.ItemLabel>
                            </DropdownMenu.Item>
                            <DropdownMenu.Item
                              disabled={isProcessing()}
                              onSelect={() => props.onForkThread(entry().id, thread.id, thread.name)}
                            >
                              <DropdownMenu.ItemLabel>Fork chat</DropdownMenu.ItemLabel>
                            </DropdownMenu.Item>
                            <DropdownMenu.Item
                              disabled={isProcessing()}
                              onSelect={() => props.onForkThreadToWorktree(entry().id, thread.id, thread.name)}
                            >
                              <DropdownMenu.ItemLabel>Fork to worktree…</DropdownMenu.ItemLabel>
                            </DropdownMenu.Item>
                            <DropdownMenu.Separator />
                            <DropdownMenu.Item onSelect={() => props.onDeleteThread(entry().id, thread.id)}>
                              <DropdownMenu.ItemLabel class="text-text-diff-delete-base">Archive</DropdownMenu.ItemLabel>
                            </DropdownMenu.Item>
                          </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                      </DropdownMenu>
                    </div>
                  </div>
                );
              }}
            </For>
            <Show when={threads().length > 3}>
              <button
                type="button"
                class="w-full text-left text-12-regular text-text-weak pl-9 py-1 transition-colors hover:text-text-base"
                onClick={(e: MouseEvent) => {
                  e.stopPropagation();
                  props.setExpandedWorkspaces((prev) => {
                    const next = new Set(prev);
                    if (next.has(entry().id)) {
                      next.delete(entry().id);
                    } else {
                      next.add(entry().id);
                    }
                    return next;
                  });
                }}
              >
                {props.expandedWorkspaces().has(entry().id) ? "Show less" : `${threads().length - 3} more…`}
              </button>
            </Show>
          </nav>
        </Collapsible.Content>
      </Collapsible>
    </div>
  );
}
