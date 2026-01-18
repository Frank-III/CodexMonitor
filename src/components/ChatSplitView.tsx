import { createMemo, Show, type Accessor } from "solid-js";
import type { ConversationItem } from "../types";
import type { ThreadPaneId } from "../stores/threadLayout";
import type { WorkspacePathPreviewStore } from "../stores/workspacePathPreview";
import { Messages } from "./Messages";
import { ThreadTabsBar } from "./ThreadTabsBar";

type ThreadStatus = {
  isProcessing: boolean;
  hasUnread: boolean;
  processingStartedAt: number | null;
  lastDurationMs: number | null;
};

type PaneState = {
  tabs: string[];
  active: string | null;
};

type ChatSplitViewProps = {
  workspaceId: Accessor<string | null>;
  split: Accessor<boolean>;
  activePane: Accessor<ThreadPaneId>;
  left: Accessor<PaneState>;
  right: Accessor<PaneState>;
  itemsByThread: Accessor<Record<string, ConversationItem[]>>;
  threadNameById: Accessor<Record<string, string>>;
  threadStatusById: Accessor<Record<string, ThreadStatus | undefined>>;
  onFocusPane: (pane: ThreadPaneId) => void;
  onSelectThread: (threadId: string, pane?: ThreadPaneId) => void;
  onCloseThread: (threadId: string) => void;
  onMoveThread: (
    threadId: string,
    fromPane: ThreadPaneId,
    toPane: ThreadPaneId,
    targetIndex: number,
  ) => void;
  onStartThread: (pane: ThreadPaneId) => void;
  onOpenSplit: () => void;
  onCloseSplit: () => void;
  onOpenFile: (path: string) => void;
  pathPreview: WorkspacePathPreviewStore;
};

function getThreadTitle(nameById: Record<string, string>, threadId: string) {
  const name = nameById[threadId]?.trim();
  if (name) return name;
  return `Agent ${threadId.slice(0, 4)}`;
}

export function ChatSplitView(props: ChatSplitViewProps) {
  const getBadge = (threadId: string) => {
    const status = props.threadStatusById()[threadId];
    if (!status) return "none" as const;
    if (status.isProcessing) return "processing" as const;
    if (status.hasUnread) return "unread" as const;
    return "none" as const;
  };

  const getName = (threadId: string) => getThreadTitle(props.threadNameById(), threadId);

  const renderPane = (pane: ThreadPaneId, state: Accessor<PaneState>) => {
    const isFocused = createMemo(() => props.activePane() === pane);
    const activeThreadId = createMemo(() => state().active);
    const items = createMemo(() => {
      const threadId = activeThreadId();
      if (!threadId) return [];
      return props.itemsByThread()[threadId] ?? [];
    });
    const status = createMemo(() => {
      const threadId = activeThreadId();
      if (!threadId) return null;
      return props.threadStatusById()[threadId] ?? null;
    });

    return (
      <div
        class="chat-pane"
        classList={{ "is-focused": isFocused() }}
        data-pane={pane}
        onPointerDown={() => props.onFocusPane(pane)}
      >
        <ThreadTabsBar
          pane={pane}
          tabs={() => state().tabs}
          activeThreadId={activeThreadId}
          isFocused={isFocused}
          isSplit={props.split}
          getThreadName={getName}
          getThreadBadge={getBadge}
          onFocusPane={() => props.onFocusPane(pane)}
          onSelectThread={(threadId) => props.onSelectThread(threadId, pane)}
          onCloseThread={props.onCloseThread}
          onMoveThread={props.onMoveThread}
          onStartThread={() => props.onStartThread(pane)}
          onOpenSplit={pane === "left" ? props.onOpenSplit : undefined}
          onCloseSplit={pane === "right" ? props.onCloseSplit : undefined}
        />
        <Show
          when={activeThreadId()}
          fallback={
            <div class="chat-pane-empty">
              <div class="chat-pane-empty-title">No thread selected</div>
              <div class="chat-pane-empty-subtitle">
                Start a new thread or pick one from the sidebar.
              </div>
            </div>
          }
        >
          <Messages
            items={items}
            isThinking={() => status()?.isProcessing ?? false}
            processingStartedAt={() => status()?.processingStartedAt ?? null}
            lastDurationMs={() => status()?.lastDurationMs ?? null}
            onOpenFile={props.onOpenFile}
            pathPreview={props.pathPreview}
          />
        </Show>
      </div>
    );
  };

  return (
    <div class="chat-split" classList={{ split: props.split() }}>
      {renderPane("left", props.left)}
      <Show when={props.split()}>
        <div class="chat-split-divider" aria-hidden />
        {renderPane("right", props.right)}
      </Show>
    </div>
  );
}
