import { createMemo, createSignal, For, Match, Show, Switch, type Accessor, type JSX } from "solid-js";
import {
  DragDropProvider,
  DragDropSensors,
  DragOverlay,
  SortableProvider,
  closestCenter,
  createSortable,
} from "@thisbeyond/solid-dnd";
import type { DragEvent } from "@thisbeyond/solid-dnd";
import { Avatar, Button, HoverCard, Icon, IconButton, Spinner, Tooltip } from "../ui";
import { DropdownMenu } from "../ui/DropdownMenu";
import type { ThreadSummary, WorkspaceInfo, WorktreeDivergence } from "../types";
import { ConstrainDragXAxis } from "../utils/solid-dnd";

const AVATAR_COLOR_KEYS = ["pink", "mint", "orange", "purple", "cyan", "lime"] as const;
type AvatarColorKey = (typeof AVATAR_COLOR_KEYS)[number];

function getAvatarColors(key?: string) {
  if (key && AVATAR_COLOR_KEYS.includes(key as AvatarColorKey)) {
    return {
      background: `var(--avatar-background-${key})`,
      foreground: `var(--avatar-text-${key})`,
    };
  }
  return {
    background: "var(--surface-info-base)",
    foreground: "var(--text-base)",
  };
}

function getWorkspaceColor(index: number): string {
  return AVATAR_COLOR_KEYS[index % AVATAR_COLOR_KEYS.length];
}

export type SidebarProps = {
  workspaces: Accessor<WorkspaceInfo[]>;
  threadsByWorkspace: Accessor<Record<string, ThreadSummary[]>>;
  threadStatusById: Accessor<Record<string, { isProcessing: boolean; hasUnread: boolean; isInterrupting?: boolean }>>;
  activeWorkspaceId: Accessor<string | null>;
  activeThreadId: Accessor<string | null>;
  worktreeDivergenceByWorkspaceId: Accessor<Record<string, { data?: WorktreeDivergence; isLoading: boolean; error: string | null } | undefined>>;
  worktreeDescendantCountByWorkspaceId: Accessor<Record<string, number>>;
  ryuSummaryByWorkspaceId: Accessor<Record<string, { title: string | null; count: number; running: boolean; ok: boolean | null; needsPush: boolean; hasConflict: boolean }>>;
  jjGraphPreviewByWorkspaceId: Accessor<Record<string, { graph: string; isLoading: boolean; error: string | null } | undefined>>;
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

function WorkspaceIcon(props: { workspace: WorkspaceInfo; index: number; notify?: boolean }): JSX.Element {
  const color = createMemo(() => getWorkspaceColor(props.index));
  const name = createMemo(() => props.workspace.name || "W");
  const hasNotification = createMemo(() => false);

  return (
    <div class="relative size-8 shrink-0 rounded">
      <div class="size-full rounded overflow-clip">
        <Avatar
          fallback={name()}
          {...getAvatarColors(color())}
          size="large"
          class="size-full rounded"
        />
      </div>
      <Show when={hasNotification() && props.notify}>
        <div class="absolute top-px right-px size-1.5 rounded-full z-10 bg-text-interactive-base" />
      </Show>
    </div>
  );
}

function SessionItem(props: {
  thread: ThreadSummary;
  workspaceId: string;
  active: boolean;
  status: { isProcessing: boolean; hasUnread: boolean; isInterrupting?: boolean } | undefined;
  onSelect: () => void;
  onFork: () => void;
  onForkToWorktree: () => void;
  onDelete: () => void;
  onRename: (newName: string) => void;
}): JSX.Element {
  const [menuOpen, setMenuOpen] = createSignal(false);

  const isWorking = () => props.status?.isProcessing && !props.status?.isInterrupting;
  const hasUnread = () => props.status?.hasUnread;

  return (
    <div
      data-session-id={props.thread.id}
      classList={{
        "group/session relative w-full rounded-md cursor-default transition-colors pl-2 pr-3": true,
        "hover:bg-surface-raised-base-hover focus-within:bg-surface-raised-base-hover": true,
        "bg-surface-base-active": props.active,
      }}
    >
      <button
        type="button"
        class="flex items-center justify-between gap-3 min-w-0 text-left w-full focus:outline-none py-1 transition-[padding] group-hover/session:pr-7 group-focus-within/session:pr-7"
        onClick={props.onSelect}
      >
        <div class="flex items-center gap-1 w-full min-w-0">
          <div class="shrink-0 size-6 flex items-center justify-center">
            <Switch fallback={<Icon name="dash" size="small" class="text-icon-weak" />}>
              <Match when={isWorking()}>
                <Spinner class="size-[15px]" />
              </Match>
              <Match when={hasUnread()}>
                <div class="size-1.5 rounded-full bg-text-interactive-base" />
              </Match>
            </Switch>
          </div>
          <Tooltip placement="top-start" value={props.thread.name} gutter={0} openDelay={3000} class="grow-1 min-w-0">
            <span class="text-14-regular text-text-strong grow-1 min-w-0 overflow-hidden text-ellipsis truncate">
              {props.thread.name}
            </span>
          </Tooltip>
        </div>
      </button>

      <div class="hidden group-hover/session:flex group-focus-within/session:flex text-text-base gap-1 items-center absolute top-1 right-1">
        <DropdownMenu open={menuOpen()} onOpenChange={setMenuOpen}>
          <Tooltip placement="right" value="Session options" gutter={8}>
            <DropdownMenu.Trigger
              as={IconButton}
              icon="dot-grid"
              variant="ghost"
              class="shrink-0 size-6 rounded-md"
            />
          </Tooltip>
          <DropdownMenu.Portal>
            <DropdownMenu.Content class="mt-1">
              <DropdownMenu.Item onSelect={props.onFork}>
                <DropdownMenu.ItemLabel>Fork session</DropdownMenu.ItemLabel>
              </DropdownMenu.Item>
              <DropdownMenu.Item onSelect={props.onForkToWorktree}>
                <DropdownMenu.ItemLabel>Fork to worktree</DropdownMenu.ItemLabel>
              </DropdownMenu.Item>
              <DropdownMenu.Separator />
              <DropdownMenu.Item onSelect={props.onDelete}>
                <DropdownMenu.ItemLabel>Archive</DropdownMenu.ItemLabel>
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu>
      </div>
    </div>
  );
}

export function Sidebar(props: SidebarProps) {
  const [draggedWorkspace, setDraggedWorkspace] = createSignal<string | undefined>();

  const selectedWorkspace = createMemo(() => {
    const id = props.activeWorkspaceId();
    return props.workspaces().find((w) => w.id === id) ?? null;
  });

  const workspaceIndex = createMemo(() => {
    const map = new Map<string, number>();
    props.workspaces().forEach((w, i) => map.set(w.id, i));
    return map;
  });

  const sessions = createMemo(() => {
    const workspace = selectedWorkspace();
    if (!workspace) return [];
    return props.threadsByWorkspace()[workspace.id] ?? [];
  });

  const handleDragStart = (event: DragEvent) => {
    setDraggedWorkspace(String(event.draggable.id));
  };

  const handleDragEnd = (event: DragEvent) => {
    const from = String(event.draggable.id);
    const to = event.droppable?.id ? String(event.droppable.id) : undefined;
    setDraggedWorkspace(undefined);

    if (!to || from === to) return;

    const workspaces = props.workspaces();
    const toIndex = workspaces.findIndex((w) => w.id === to);
    if (toIndex >= 0) {
      props.onReorderWorkspace(from, toIndex);
    }
  };

  const handleDragOver = (_event: DragEvent) => {};

  const SortableWorkspace = (workspaceProps: { workspace: WorkspaceInfo; index: number }): JSX.Element => {
    const sortable = createSortable(workspaceProps.workspace.id);
    const selected = createMemo(() => workspaceProps.workspace.id === props.activeWorkspaceId());

    const recentSessions = createMemo(() => {
      return (props.threadsByWorkspace()[workspaceProps.workspace.id] ?? []).slice(0, 2);
    });

    const trigger = (
      <button
        type="button"
        classList={{
          "flex items-center justify-center size-10 p-1 rounded-lg overflow-hidden transition-colors cursor-default": true,
          "bg-transparent border-2 border-icon-strong-base hover:bg-surface-base-hover": selected(),
          "bg-transparent border border-transparent hover:bg-surface-base-hover hover:border-border-weak-base": !selected(),
        }}
        onClick={() => props.onSelectWorkspace(workspaceProps.workspace.id)}
      >
        <WorkspaceIcon workspace={workspaceProps.workspace} index={workspaceProps.index} notify />
      </button>
    );

    return (
      // @ts-ignore - solid-dnd directive
      <div use:sortable classList={{ "opacity-30": sortable.isActiveDraggable }}>
        <HoverCard
          openDelay={0}
          closeDelay={0}
          placement="right-start"
          gutter={6}
          trigger={trigger}
        >
          <div class="-m-3 flex flex-col w-72">
            <div class="px-4 pt-2 pb-1 text-14-medium text-text-strong truncate">
              {workspaceProps.workspace.name}
            </div>
            <div class="px-4 pb-2 text-12-medium text-text-weak">Recent sessions</div>
            <div class="px-2 pb-2 flex flex-col gap-1">
              <For each={recentSessions()}>
                {(session) => (
                  <button
                    type="button"
                    class="flex items-center gap-2 px-2 py-1 rounded-md text-left hover:bg-surface-raised-base-hover"
                    onClick={() => props.onSelectThread(workspaceProps.workspace.id, session.id)}
                  >
                    <span class="size-1.5 rounded-full bg-icon-base" />
                    <span class="text-14-medium text-text-base truncate">{session.name}</span>
                  </button>
                )}
              </For>
              <Show when={recentSessions().length === 0}>
                <div class="px-2 py-1 text-12-regular text-text-weak">No sessions yet</div>
              </Show>
            </div>
            <Show when={!selected()}>
              <div class="px-2 py-2 border-t border-border-weak-base">
                <Button
                  variant="ghost"
                  class="flex w-full text-left justify-start text-text-base px-2 hover:bg-transparent active:bg-transparent"
                  onClick={() => props.onSelectWorkspace(workspaceProps.workspace.id)}
                >
                  View all sessions
                </Button>
              </div>
            </Show>
          </div>
        </HoverCard>
      </div>
    );
  };

  const WorkspaceDragOverlay = (): JSX.Element => {
    const workspace = createMemo(() => props.workspaces().find((w) => w.id === draggedWorkspace()));
    const index = createMemo(() => workspaceIndex().get(draggedWorkspace() ?? "") ?? 0);

    return (
      <Show when={workspace()}>
        {(w) => (
          <div class="bg-background-base rounded-xl p-1">
            <WorkspaceIcon workspace={w()} index={index()} />
          </div>
        )}
      </Show>
    );
  };

  return (
    <div data-component="sidebar" class="flex h-full w-full overflow-hidden">
      {/* Left rail - 64px with workspace avatars */}
      <div class="sidebar-left-rail w-16 shrink-0 flex flex-col items-center overflow-hidden">
        <div class="flex-1 min-h-0 w-full">
          <DragDropProvider
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            collisionDetector={closestCenter}
          >
            <DragDropSensors />
            <ConstrainDragXAxis />
            <div class="h-full w-full flex flex-col items-center gap-3 px-3 pb-2 overflow-y-auto no-scrollbar traffic-light-clearance">
              <SortableProvider ids={props.workspaces().map((w) => w.id)}>
                <For each={props.workspaces()}>
                  {(workspace, index) => <SortableWorkspace workspace={workspace} index={index()} />}
                </For>
              </SortableProvider>
              <Tooltip placement="right" value="Open project">
                <IconButton icon="plus" variant="ghost" size="large" onClick={props.onAddWorkspace} />
              </Tooltip>
            </div>
            <DragOverlay>
              <WorkspaceDragOverlay />
            </DragOverlay>
          </DragDropProvider>
        </div>

        {/* Bottom buttons */}
        <div class="shrink-0 w-full pt-3 pb-3 flex flex-col items-center gap-2">
          <Tooltip placement="right" value="Settings">
            <IconButton icon="settings-gear" variant="ghost" size="large" onClick={props.onOpenSettings} />
          </Tooltip>
          <Tooltip placement="right" value="Help">
            <IconButton icon="help" variant="ghost" size="large" />
          </Tooltip>
        </div>
      </div>

      {/* Secondary panel - workspace details and session list */}
      <Show when={selectedWorkspace()}>
        {(workspace) => (
          <div class="sidebar-secondary-panel flex flex-col min-h-0 flex-1 rounded-tl-sm">
            {/* Workspace header */}
            <div class="shrink-0 px-2 pb-1 traffic-light-clearance">
              <div class="group/project flex items-start justify-between gap-2 p-2 pr-1">
                <div class="flex flex-col min-w-0">
                  <span class="text-16-medium text-text-strong truncate">{workspace().name}</span>
                  <Tooltip placement="top" gutter={2} value={workspace().path}>
                    <span class="text-12-regular text-text-base truncate">
                      {workspace().path.replace(/^\/Users\/[^/]+/, "~")}
                    </span>
                  </Tooltip>
                </div>

                <DropdownMenu>
                  <DropdownMenu.Trigger
                    as={IconButton}
                    icon="dot-grid"
                    variant="ghost"
                    class="shrink-0 size-6 rounded-md opacity-0 group-hover/project:opacity-100 data-[expanded]:opacity-100"
                  />
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content class="mt-1">
                      <Show when={workspace().kind === "worktree"}>
                        <DropdownMenu.Item onSelect={() => props.onSyncWorktree(workspace())}>
                          <DropdownMenu.ItemLabel>Sync worktree</DropdownMenu.ItemLabel>
                        </DropdownMenu.Item>
                        <DropdownMenu.Item onSelect={() => props.onLandWorktree(workspace())}>
                          <DropdownMenu.ItemLabel>Land worktree</DropdownMenu.ItemLabel>
                        </DropdownMenu.Item>
                        <DropdownMenu.Item onSelect={() => props.onEditWorktreeBaseRevset(workspace())}>
                          <DropdownMenu.ItemLabel>Edit base revset</DropdownMenu.ItemLabel>
                        </DropdownMenu.Item>
                        <DropdownMenu.Separator />
                      </Show>
                      <DropdownMenu.Item onSelect={() => props.onDeleteWorkspace(workspace().id)}>
                        <DropdownMenu.ItemLabel>Close workspace</DropdownMenu.ItemLabel>
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu>
              </div>
            </div>

            {/* New session button */}
            <div class="py-4 px-3">
              <Button
                size="large"
                icon="plus-small"
                class="w-full"
                onClick={() => props.onAddAgent(workspace())}
              >
                New session
              </Button>
            </div>

            {/* Session list */}
            <div class="flex-1 min-h-0 overflow-y-auto px-2 pb-2">
              <div class="flex flex-col gap-1">
                <For each={sessions()}>
                  {(thread) => (
                    <SessionItem
                      thread={thread}
                      workspaceId={workspace().id}
                      active={thread.id === props.activeThreadId()}
                      status={props.threadStatusById()[thread.id]}
                      onSelect={() => props.onSelectThread(workspace().id, thread.id)}
                      onFork={() => props.onForkThread(workspace().id, thread.id, thread.name)}
                      onForkToWorktree={() => props.onForkThreadToWorktree(workspace().id, thread.id, thread.name)}
                      onDelete={() => props.onDeleteThread(workspace().id, thread.id)}
                      onRename={(newName) => props.onRenameThread(workspace().id, thread.id, newName)}
                    />
                  )}
                </For>
                <Show when={sessions().length === 0}>
                  <div class="py-8 px-4 text-center text-text-weak text-14-regular">
                    No sessions yet. Create one to get started.
                  </div>
                </Show>
              </div>
            </div>

            {/* Worktree info at bottom if applicable */}
            <Show when={workspace().kind === "worktree"}>
              <div class="shrink-0 px-3 py-2 border-t border-border-weak-base">
                <div class="flex items-center gap-2 text-12-regular text-text-weak">
                  <Icon name="branch" size="small" class="text-icon-base" />
                  <span>Worktree</span>
                </div>
              </div>
            </Show>
          </div>
        )}
      </Show>

      {/* Empty state when no workspace selected */}
      <Show when={!selectedWorkspace() && props.workspaces().length > 0}>
        <div class="sidebar-secondary-panel flex-1 flex items-center justify-center rounded-tl-sm">
          <div class="text-center px-8">
            <div class="text-14-medium text-text-weak">Select a workspace</div>
          </div>
        </div>
      </Show>

      {/* Empty state when no workspaces */}
      <Show when={props.workspaces().length === 0}>
        <div class="sidebar-secondary-panel flex-1 flex items-center justify-center rounded-tl-sm">
          <div class="text-center px-8">
            <Icon name="folder-add-left" size="large" class="mx-auto mb-4 text-icon-base" />
            <div class="text-14-medium text-text-strong mb-1">No workspaces</div>
            <div class="text-12-regular text-text-weak mb-4">Get started by opening a project</div>
            <Button onClick={props.onAddWorkspace}>
              Open project
            </Button>
          </div>
        </div>
      </Show>
    </div>
  );
}
