import { createMemo, For, Show, type Accessor } from "solid-js";
import { HoverCard, Icon, Button, Spinner } from "../ui";
import type { ThreadSummary, WorkspaceInfo } from "../types";

function hashString(value: string) {
  let hash = 0;
  for (let idx = 0; idx < value.length; idx += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(idx);
    hash |= 0;
  }
  return hash;
}

function workspaceInitial(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const match = trimmed.match(/[A-Za-z0-9]/);
  return (match?.[0] ?? trimmed[0] ?? "?").toUpperCase();
}

type WorktreeEntry = {
  id: string;
  name: string;
  branch?: string;
  isLocal: boolean;
  sessions: ThreadSummary[];
};

export type WorkspacePreviewCardProps = {
  workspace: WorkspaceInfo;
  worktrees: WorkspaceInfo[];
  threadsByWorkspace: Accessor<Record<string, ThreadSummary[]>>;
  threadStatusById: Accessor<Record<string, { isProcessing: boolean; hasUnread: boolean }>>;
  isActive: boolean;
  onSelectWorkspace: () => void;
  onSelectThread: (workspaceId: string, threadId: string) => void;
  onNewSession: (workspaceId: string) => void;
};

function SessionItem(props: {
  session: ThreadSummary;
  workspaceId: string;
  status?: { isProcessing: boolean; hasUnread: boolean };
  onSelect: () => void;
  dense?: boolean;
}) {
  return (
    <button
      type="button"
      class="group/session relative w-full rounded-md cursor-default transition-colors pl-2 pr-3
             hover:bg-surface-raised-base-hover focus-within:bg-surface-raised-base-hover"
      onClick={props.onSelect}
    >
      <div class={`flex items-center gap-1 w-full min-w-0 text-left ${props.dense ? "py-0.5" : "py-1"}`}>
        <div class="shrink-0 size-6 flex items-center justify-center">
          <Show
            when={props.status?.isProcessing}
            fallback={
              <Show
                when={props.status?.hasUnread}
                fallback={<Icon name="dash" size="small" class="text-icon-weak-base" />}
              >
                <div class="size-1.5 rounded-full bg-text-interactive-base" />
              </Show>
            }
          >
            <Spinner class="size-[15px]" />
          </Show>
        </div>
        <span class="text-14-regular text-text-strong grow-1 min-w-0 overflow-hidden text-ellipsis truncate">
          {props.session.name}
        </span>
      </div>
    </button>
  );
}

function WorktreeSection(props: {
  worktree: WorktreeEntry;
  workspaceId: string;
  threadStatusById: Accessor<Record<string, { isProcessing: boolean; hasUnread: boolean }>>;
  onSelectThread: (workspaceId: string, threadId: string) => void;
}) {
  return (
    <div class="flex flex-col gap-1">
      <div class="px-2 py-0.5 flex items-center gap-1 min-w-0">
        <div class="shrink-0 size-6 flex items-center justify-center">
          <Icon name="branch" size="small" class="text-icon-base" />
        </div>
        <span class="text-14-medium text-text-base shrink-0">
          {props.worktree.isLocal ? "local" : "worktree"} :
        </span>
        <span class="truncate text-14-medium text-text-base">
          {props.worktree.branch ?? props.worktree.name}
        </span>
      </div>
      <Show when={props.worktree.sessions.length === 0}>
        <div class="pl-10 text-12-regular text-text-weak">No sessions</div>
      </Show>
      <For each={props.worktree.sessions.slice(0, 3)}>
        {(session) => (
          <SessionItem
            session={session}
            workspaceId={props.workspaceId}
            status={props.threadStatusById()[session.id]}
            onSelect={() => props.onSelectThread(props.workspaceId, session.id)}
            dense
          />
        )}
      </For>
    </div>
  );
}

export function WorkspacePreviewCard(props: WorkspacePreviewCardProps) {
  const hue = createMemo(() => {
    const raw = hashString(props.workspace.name);
    return Math.abs(raw) % 360;
  });

  const initial = createMemo(() => workspaceInitial(props.workspace.name));

  const worktreeEntries = createMemo<WorktreeEntry[]>(() => {
    const mainSessions = props.threadsByWorkspace()[props.workspace.id] ?? [];
    const entries: WorktreeEntry[] = [
      {
        id: props.workspace.id,
        name: props.workspace.name,
        branch: props.workspace.jj_branch ?? undefined,
        isLocal: true,
        sessions: mainSessions.slice(0, 3),
      },
    ];

    for (const worktree of props.worktrees) {
      const sessions = props.threadsByWorkspace()[worktree.id] ?? [];
      entries.push({
        id: worktree.id,
        name: worktree.name,
        branch: worktree.jj_branch ?? undefined,
        isLocal: false,
        sessions: sessions.slice(0, 3),
      });
    }

    return entries;
  });

  const hasWorktrees = createMemo(() => props.worktrees.length > 0);
  const allSessions = createMemo(() => {
    const main = props.threadsByWorkspace()[props.workspace.id] ?? [];
    return main.slice(0, 6);
  });

  const trigger = (
    <button
      type="button"
      classList={{
        "flex items-center justify-center size-10 p-1 rounded-lg overflow-hidden transition-colors cursor-default": true,
        "bg-transparent border-2 border-icon-strong-base hover:bg-surface-base-hover": props.isActive,
        "bg-transparent border border-transparent hover:bg-surface-base-hover hover:border-border-weak-base": !props.isActive,
      }}
      onClick={props.onSelectWorkspace}
    >
      <span
        class="flex items-center justify-center size-full rounded-md text-14-medium font-semibold"
        style={{
          "background-color": `oklch(0.35 0.12 ${hue()})`,
          color: `oklch(0.85 0.08 ${hue()})`,
        }}
      >
        {initial()}
      </span>
    </button>
  );

  return (
    <HoverCard openDelay={100} closeDelay={50} placement="right-start" gutter={8} trigger={trigger}>
      <div class="-m-3 flex flex-col w-72">
        <div class="px-4 pt-2 pb-1 text-16-medium text-text-strong truncate">{props.workspace.name}</div>
        <div class="px-4 pb-2 text-12-medium text-text-weak">Recent sessions</div>

        <div class="px-2 pb-2 flex flex-col gap-2">
          <Show
            when={hasWorktrees()}
            fallback={
              <Show
                when={allSessions().length > 0}
                fallback={<div class="px-2 py-2 text-12-regular text-text-weak">No sessions yet</div>}
              >
                <For each={allSessions()}>
                  {(session) => (
                    <SessionItem
                      session={session}
                      workspaceId={props.workspace.id}
                      status={props.threadStatusById()[session.id]}
                      onSelect={() => props.onSelectThread(props.workspace.id, session.id)}
                      dense
                    />
                  )}
                </For>
              </Show>
            }
          >
            <For each={worktreeEntries().slice(0, 3)}>
              {(worktree) => (
                <WorktreeSection
                  worktree={worktree}
                  workspaceId={worktree.id}
                  threadStatusById={props.threadStatusById}
                  onSelectThread={props.onSelectThread}
                />
              )}
            </For>
          </Show>
        </div>

        <div class="px-2 py-2 border-t border-border-weak-base">
          <Button
            variant="ghost"
            class="flex w-full text-left justify-start text-text-base px-2 hover:bg-transparent active:bg-transparent"
            onClick={props.onSelectWorkspace}
          >
            View all sessions
          </Button>
        </div>
      </div>
    </HoverCard>
  );
}
