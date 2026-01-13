import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { Portal } from "solid-js/web";
import type { ThreadSummary } from "../types";

type PopoverPlacement = "left" | "right";

type PopoverPosition = {
  top: number;
  left: number;
  placement: PopoverPlacement;
};

export type WorkspaceSessionsPopoverProps = {
  workspaceName: string;
  threads: ThreadSummary[];
  isActive?: boolean;
  onSelectWorkspace?: () => void;
  onSelectThread: (threadId: string) => void;
};

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

export function WorkspaceSessionsPopover(props: WorkspaceSessionsPopoverProps) {
  const [triggerHover, setTriggerHover] = createSignal(false);
  const [popoverHover, setPopoverHover] = createSignal(false);
  const [focused, setFocused] = createSignal(false);

  const isOpen = createMemo(
    () => triggerHover() || popoverHover() || focused(),
  );
  const close = () => {
    setTriggerHover(false);
    setPopoverHover(false);
    setFocused(false);
  };

  const [position, setPosition] = createSignal<PopoverPosition | null>(null);
  let triggerRef: HTMLButtonElement | undefined;
  let popoverRef: HTMLDivElement | undefined;

  const hue = createMemo(() => {
    const raw = hashString(props.workspaceName);
    return Math.abs(raw) % 360;
  });

  const initial = createMemo(() => workspaceInitial(props.workspaceName));
  const visibleThreads = createMemo(() => props.threads.slice(0, 6));

  const updatePosition = () => {
    const trigger = triggerRef;
    const popover = popoverRef;
    if (!trigger || !popover) {
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const margin = 12;
    const width = popover.offsetWidth || 320;
    const height = popover.offsetHeight || 280;

    const roomRight = window.innerWidth - rect.right - margin;
    const roomLeft = rect.left - margin;
    const placement: PopoverPlacement =
      roomRight >= width || roomRight >= roomLeft ? "right" : "left";

    let left =
      placement === "right" ? rect.right + margin : rect.left - margin - width;
    left = Math.max(margin, Math.min(left, window.innerWidth - margin - width));

    let top = rect.top + rect.height / 2 - height / 2;
    top = Math.max(margin, Math.min(top, window.innerHeight - margin - height));

    setPosition({ top, left, placement });
  };

  createEffect(() => {
    if (!isOpen()) {
      setPosition(null);
      return;
    }

    requestAnimationFrame(updatePosition);
    const handle = () => updatePosition();
    window.addEventListener("resize", handle);
    window.addEventListener("scroll", handle, true);
    return () => {
      window.removeEventListener("resize", handle);
      window.removeEventListener("scroll", handle, true);
    };
  });

  createEffect(() => {
    if (!isOpen()) return;
    props.threads.length;
    requestAnimationFrame(updatePosition);
  });

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        class="workspace-icon-button"
        aria-label={`Recent sessions for ${props.workspaceName}`}
        onClick={() => props.onSelectWorkspace?.()}
        onPointerEnter={() => setTriggerHover(true)}
        onPointerLeave={() => setTriggerHover(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      >
        <span
          class="workspace-icon"
          classList={{ "is-active": Boolean(props.isActive) }}
          style={{ "--workspace-hue": String(hue()) }}
        >
          {initial()}
        </span>
      </button>

      <Show when={isOpen() && position()}>
        {(pos) => (
          <Portal>
            <div
              ref={popoverRef}
              class="workspace-sessions-popover"
              role="tooltip"
              style={{
                top: `${pos().top}px`,
                left: `${pos().left}px`,
              }}
              onPointerEnter={() => setPopoverHover(true)}
              onPointerLeave={() => setPopoverHover(false)}
            >
              <div class="workspace-sessions-header">
                <div class="workspace-sessions-title">Recent sessions</div>
                <div class="workspace-sessions-subtitle">{props.workspaceName}</div>
              </div>
              <div class="workspace-sessions-body">
                <Show
                  when={visibleThreads().length}
                  fallback={
                    <div class="workspace-sessions-empty">No sessions yet.</div>
                  }
                >
                  <For each={visibleThreads()}>
                    {(thread) => (
                      <button
                        type="button"
                        class="workspace-sessions-item"
                        onClick={(event) => {
                          event.stopPropagation();
                          props.onSelectThread(thread.id);
                          close();
                        }}
                      >
                        <span class="workspace-sessions-item-dash" aria-hidden>
                          —
                        </span>
                        <span class="workspace-sessions-item-label">{thread.name}</span>
                      </button>
                    )}
                  </For>
                </Show>
              </div>
            </div>
          </Portal>
        )}
      </Show>
    </>
  );
}
