import { createMemo, createSignal, For, Show, type Accessor } from "solid-js";
import type { ThreadPaneId } from "../stores/threadLayout";

type DragPayload = {
  kind: "thread-tab";
  threadId: string;
  fromPane: ThreadPaneId;
};

function encodePayload(payload: DragPayload) {
  return JSON.stringify(payload);
}

function decodePayload(value: string | undefined | null): DragPayload | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<DragPayload>;
    if (parsed.kind !== "thread-tab") return null;
    if (typeof parsed.threadId !== "string" || !parsed.threadId) return null;
    if (parsed.fromPane !== "left" && parsed.fromPane !== "right") return null;
    return {
      kind: "thread-tab",
      threadId: parsed.threadId,
      fromPane: parsed.fromPane,
    };
  } catch {
    return null;
  }
}

type ThreadTabsBarProps = {
  pane: ThreadPaneId;
  tabs: Accessor<string[]>;
  activeThreadId: Accessor<string | null>;
  isFocused: Accessor<boolean>;
  isSplit: Accessor<boolean>;
  getThreadName: (threadId: string) => string;
  getThreadBadge: (threadId: string) => "processing" | "unread" | "none";
  onFocusPane: () => void;
  onSelectThread: (threadId: string) => void;
  onCloseThread: (threadId: string) => void;
  onMoveThread: (
    threadId: string,
    fromPane: ThreadPaneId,
    toPane: ThreadPaneId,
    targetIndex: number,
  ) => void;
  onStartThread?: () => void;
  onOpenSplit?: () => void;
  onCloseSplit?: () => void;
};

export function ThreadTabsBar(props: ThreadTabsBarProps) {
  const [dropTarget, setDropTarget] = createSignal<{
    threadId: string;
    index: number;
    before: boolean;
  } | null>(null);

  const hasTabs = createMemo(() => props.tabs().length > 0);

  const handleDropAt = (payload: DragPayload, targetIndex: number) => {
    props.onMoveThread(payload.threadId, payload.fromPane, props.pane, targetIndex);
  };

  const handleDragOverBar = (event: DragEvent) => {
    const payload = decodePayload(event.dataTransfer?.getData("text/plain"));
    if (!payload) return;
    event.preventDefault();
    event.dataTransfer!.dropEffect = "move";
    setDropTarget(null);
  };

  const handleDropOnBar = (event: DragEvent) => {
    const payload = decodePayload(event.dataTransfer?.getData("text/plain"));
    if (!payload) return;
    event.preventDefault();
    handleDropAt(payload, props.tabs().length);
    setDropTarget(null);
    props.onFocusPane();
  };

  const handleDragLeaveBar = () => {
    setDropTarget(null);
  };

  const renderTab = (threadId: string, index: Accessor<number>) => {
    const isActive = createMemo(() => props.activeThreadId() === threadId);
    const badge = createMemo(() => props.getThreadBadge(threadId));

    const onSelect = () => {
      props.onFocusPane();
      props.onSelectThread(threadId);
    };

    const onClose = (event: MouseEvent) => {
      event.stopPropagation();
      props.onCloseThread(threadId);
    };

    const onDragStart = (event: DragEvent) => {
      if (!event.dataTransfer) return;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(
        "text/plain",
        encodePayload({ kind: "thread-tab", threadId, fromPane: props.pane }),
      );
    };

    const onDragOver = (event: DragEvent) => {
      const payload = decodePayload(event.dataTransfer?.getData("text/plain"));
      if (!payload) return;
      event.preventDefault();
      event.dataTransfer!.dropEffect = "move";
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      const before = event.clientX < rect.left + rect.width / 2;
      setDropTarget({ threadId, index: index(), before });
    };

    const onDragLeave = (event: DragEvent) => {
      const related = event.relatedTarget as Node | null;
      if (related && event.currentTarget instanceof HTMLElement && event.currentTarget.contains(related)) {
        return;
      }
      setDropTarget((prev) => (prev?.threadId === threadId ? null : prev));
    };

    const onDrop = (event: DragEvent) => {
      const payload = decodePayload(event.dataTransfer?.getData("text/plain"));
      if (!payload) return;
      event.preventDefault();
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      const before = event.clientX < rect.left + rect.width / 2;

      const existingIndex = props.tabs().indexOf(payload.threadId);
      let targetIndex = index() + (before ? 0 : 1);
      if (payload.fromPane === props.pane && existingIndex >= 0 && existingIndex < targetIndex) {
        targetIndex -= 1;
      }

      handleDropAt(payload, targetIndex);
      setDropTarget(null);
      props.onFocusPane();
    };

    return (
      <div
        class="thread-tab"
        classList={{
          active: isActive(),
          "is-focused": props.isFocused(),
          "drop-before": dropTarget()?.threadId === threadId && dropTarget()?.before === true,
          "drop-after": dropTarget()?.threadId === threadId && dropTarget()?.before === false,
        }}
        role="tab"
        tabindex={isActive() ? 0 : -1}
        aria-selected={isActive()}
        draggable
        onPointerDown={() => props.onFocusPane()}
        onClick={onSelect}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <span class="thread-tab-title">{props.getThreadName(threadId)}</span>
        <Show when={badge() !== "none"}>
          <span class={`thread-tab-badge ${badge()}`} aria-hidden />
        </Show>
        <button
          class="thread-tab-close"
          type="button"
          aria-label="Close tab"
          onClick={onClose}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M7 7 17 17M17 7 7 17"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
            />
          </svg>
        </button>
      </div>
    );
  };

  return (
    <div
      class="thread-tabs"
      classList={{ "is-focused": props.isFocused() }}
      role="tablist"
      onPointerDown={() => props.onFocusPane()}
      onDragOver={handleDragOverBar}
      onDrop={handleDropOnBar}
      onDragLeave={handleDragLeaveBar}
      data-pane={props.pane}
    >
      <For each={props.tabs()}>{renderTab}</For>
      <Show when={!hasTabs()}>
        <div class="thread-tabs-empty">Drop a thread here</div>
      </Show>
      <div class="thread-tabs-actions">
        <Show when={props.onStartThread}>
          <button
            class="thread-tabs-action"
            type="button"
            aria-label="New thread"
            title="New thread"
            onClick={() => props.onStartThread?.()}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 5v14M5 12h14"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
              />
            </svg>
          </button>
        </Show>
        <Show when={props.pane === "left" && props.onOpenSplit && !props.isSplit()}>
          <button
            class="thread-tabs-action"
            type="button"
            aria-label="Split view"
            title="Split view"
            onClick={() => props.onOpenSplit?.()}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden>
              <rect
                x="4.5"
                y="5.5"
                width="15"
                height="13"
                rx="2.2"
                stroke="currentColor"
                stroke-width="1.4"
              />
              <path
                d="M12 6v12"
                stroke="currentColor"
                stroke-width="1.4"
                stroke-linecap="round"
              />
            </svg>
          </button>
        </Show>
        <Show when={props.pane === "right" && props.onCloseSplit && props.isSplit()}>
          <button
            class="thread-tabs-action"
            type="button"
            aria-label="Close split"
            title="Close split"
            onClick={() => props.onCloseSplit?.()}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden>
              <rect
                x="4.5"
                y="5.5"
                width="15"
                height="13"
                rx="2.2"
                stroke="currentColor"
                stroke-width="1.4"
              />
              <path
                d="M12 6v12"
                stroke="currentColor"
                stroke-width="1.4"
                stroke-linecap="round"
              />
              <path
                d="M15 12h3"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
              />
            </svg>
          </button>
        </Show>
      </div>
    </div>
  );
}
