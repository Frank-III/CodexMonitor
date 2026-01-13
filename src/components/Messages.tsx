import { createEffect, createMemo, createSignal, onCleanup, For, Show, type Accessor } from "solid-js";
import type { ConversationItem } from "../types";
import type { WorkspacePathPreviewStore } from "../stores/workspacePathPreview";
import { SessionMessageRail, type MessageNavEntry } from "../ui";
import { SessionTurn } from "./SessionTurn";

type MessagesProps = {
  items: Accessor<ConversationItem[]>;
  isThinking: Accessor<boolean>;
  processingStartedAt?: Accessor<number | null>;
  lastDurationMs?: Accessor<number | null>;
  onOpenFile?: (path: string) => void;
  pathPreview?: WorkspacePathPreviewStore;
};

type UserTurn = {
  id: string;
  text: string;
  title?: string;
};

function scrollKeyForItems(items: ConversationItem[]) {
  if (!items.length) return "empty";
  const last = items[items.length - 1];
  switch (last.kind) {
    case "message":
      return `${last.id}-${last.text.length}`;
    case "reasoning":
      return `${last.id}-${last.summary.length}-${last.content.length}`;
    case "diff":
      return `${last.id}-${last.status ?? ""}-${last.diff.length}`;
    case "tool":
      return `${last.id}-${last.status ?? ""}-${(last.output ?? "").length}`;
    default: {
      const _exhaustive: never = last;
      return _exhaustive;
    }
  }
}

export function Messages(props: MessagesProps) {
  let scrollRef: HTMLDivElement | undefined;
  let bottomRef: HTMLDivElement | undefined;
  const [activeUserMessageId, setActiveUserMessageId] = createSignal<string | null>(null);
  const [expandedSteps, setExpandedSteps] = createSignal<Set<string>>(new Set());

  const scrollKey = createMemo(() => scrollKeyForItems(props.items()));

  const userTurns = createMemo<UserTurn[]>(() => {
    const turns: UserTurn[] = [];
    for (const item of props.items()) {
      if (item.kind !== "message" || item.role !== "user") continue;
      const trimmed = item.text.trim();
      const firstLine = trimmed.split("\n").map((line) => line.trim()).find(Boolean) ?? "";
      const baseTitle = firstLine.replace(/\s+/g, " ").trim();
      const title = baseTitle.length > 80 ? `${baseTitle.slice(0, 80)}…` : baseTitle || undefined;
      turns.push({ id: item.id, text: item.text, title });
    }
    return turns;
  });

  const lastUserTurnId = createMemo(() => {
    const turns = userTurns();
    return turns.length > 0 ? turns[turns.length - 1].id : null;
  });

  const navEntries = createMemo<MessageNavEntry[]>(() =>
    userTurns().map((turn, i) => ({
      id: turn.id,
      title: turn.title || `Message ${i + 1}`,
    }))
  );

  const hasRail = createMemo(() => navEntries().length > 1);

  const updateActiveUserMessage = () => {
    const container = scrollRef;
    if (!container) return;
    const nodes = Array.from(container.querySelectorAll<HTMLElement>("[data-message]"));
    if (nodes.length === 0) {
      setActiveUserMessageId(null);
      return;
    }
    const containerTop = container.getBoundingClientRect().top;
    const threshold = containerTop + 80;
    let active = nodes[0].dataset.message ?? null;
    for (const node of nodes) {
      const rect = node.getBoundingClientRect();
      if (rect.top <= threshold) {
        active = node.dataset.message ?? active;
      } else {
        break;
      }
    }
    setActiveUserMessageId(active);
  };

  let scrollSpyFrame = 0;
  const scheduleScrollSpy = () => {
    if (scrollSpyFrame) return;
    scrollSpyFrame = window.requestAnimationFrame(() => {
      scrollSpyFrame = 0;
      updateActiveUserMessage();
    });
  };

  const scrollToUserMessage = (id: string) => {
    const container = scrollRef;
    if (!container) return;
    const nodes = Array.from(container.querySelectorAll<HTMLElement>("[data-message]"));
    const target = nodes.find((node) => node.dataset.message === id);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  createEffect(() => {
    scrollKey();
    props.isThinking();
    if (!bottomRef) return;
    let raf1 = 0;
    let raf2 = 0;
    const target = bottomRef;
    raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        target.scrollIntoView({ behavior: "smooth", block: "end" });
        scheduleScrollSpy();
      });
    });
    onCleanup(() => {
      if (raf1) window.cancelAnimationFrame(raf1);
      if (raf2) window.cancelAnimationFrame(raf2);
    });
  });

  const toggleStepsExpanded = (id: string) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div class="relative flex min-h-0 flex-1 overflow-hidden">
      <Show when={hasRail()}>
        <SessionMessageRail
          messages={navEntries()}
          currentId={activeUserMessageId() ?? undefined}
          onMessageSelect={scrollToUserMessage}
          class="z-10"
        />
      </Show>
      <div
        ref={scrollRef}
        class="flex min-h-0 flex-1 flex-col overflow-y-auto"
        classList={{ "pl-10": hasRail() }}
        onScroll={() => scheduleScrollSpy()}
      >
        <Show
          when={userTurns().length > 0}
          fallback={
            <div class="flex flex-1 items-center justify-center p-6 text-14-regular text-text-weak">
              Start a thread and send a prompt to the agent.
            </div>
          }
        >
          <For each={userTurns()}>
            {(turn) => {
              const isLastTurn = () => turn.id === lastUserTurnId();
              const isWorking = () => props.isThinking() && isLastTurn();
              const stepsExpanded = () => expandedSteps().has(turn.id);

              return (
                <SessionTurn
                  userMessageId={turn.id}
                  userMessageText={turn.text}
                  userMessageTitle={turn.title}
                  items={props.items}
                  isWorking={() => isWorking()}
                  stepsExpanded={stepsExpanded()}
                  onStepsExpandedToggle={() => toggleStepsExpanded(turn.id)}
                  onOpenFile={props.onOpenFile}
                  pathPreview={props.pathPreview}
                  classes={{
                    root: "w-full",
                    content: "px-6 py-4",
                    container: "max-w-[50rem] mx-auto",
                  }}
                />
              );
            }}
          </For>
        </Show>
        <div ref={bottomRef} class="h-20 shrink-0" />
      </div>
    </div>
  );
}
