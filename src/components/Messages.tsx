import { createEffect, For, Show, type Accessor } from "solid-js";
import type { ConversationItem } from "../types";
import { Markdown } from "./Markdown";

type MessagesProps = {
  items: Accessor<ConversationItem[]>;
  isThinking: Accessor<boolean>;
};

export function Messages(props: MessagesProps) {
  let bottomRef: HTMLDivElement | undefined;

  createEffect(() => {
    // Trigger on items length or thinking state change
    const _ = props.items().length;
    const __ = props.isThinking();
    bottomRef?.scrollIntoView({ behavior: "smooth", block: "end" });
  });

  return (
    <div class="messages messages-full">
      <For each={props.items()}>
        {(item) => {
          if (item.kind === "message") {
            return (
              <div class={`message ${item.role}`}>
                <div class="bubble">
                  <Markdown value={item.text} class="markdown" />
                </div>
              </div>
            );
          }
          if (item.kind === "reasoning") {
            const summaryText = item.summary || item.content;
            const summaryLines = summaryText
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean);
            const rawTitle =
              summaryLines.length > 0
                ? summaryLines[summaryLines.length - 1]
                : "Reasoning";
            const cleanTitle = rawTitle
              .replace(/[`*_~]/g, "")
              .replace(/\[(.*?)\]\(.*?\)/g, "$1")
              .trim();
            const summaryTitle =
              cleanTitle.length > 80
                ? `${cleanTitle.slice(0, 80)}...`
                : cleanTitle || "Reasoning";
            return (
              <details class="item-card reasoning">
                <summary>
                  <span class="item-summary-left">
                    <span class="item-chevron" aria-hidden>
                      ▸
                    </span>
                    <span class="item-title">{summaryTitle}</span>
                  </span>
                </summary>
                <div class="item-body">
                  <Show when={item.summary}>
                    <Markdown value={item.summary} class="item-text markdown" />
                  </Show>
                  <Show when={item.content}>
                    <Markdown value={item.content} class="item-text markdown" />
                  </Show>
                </div>
              </details>
            );
          }
          if (item.kind === "diff") {
            return (
              <details class="item-card diff">
                <summary>
                  <span class="item-summary-left">
                    <span class="item-chevron" aria-hidden>
                      ▸
                    </span>
                    <span class="item-title">{item.title}</span>
                  </span>
                  <Show when={item.status}>
                    <span class="item-status">{item.status}</span>
                  </Show>
                </summary>
                <div class="item-body">
                  <Markdown
                    value={item.diff}
                    class="item-output markdown"
                    codeBlock
                  />
                </div>
              </details>
            );
          }
          // Tool items
          const isFileChange = item.toolType === "fileChange";
          return (
            <details class="item-card tool">
              <summary>
                <span class="item-summary-left">
                  <span class="item-chevron" aria-hidden>
                    ▸
                  </span>
                  <span class="item-title">{item.title}</span>
                </span>
                <Show when={item.status}>
                  <span class="item-status">{item.status}</span>
                </Show>
              </summary>
              <div class="item-body">
                <Show when={!isFileChange && item.detail}>
                  <Markdown value={item.detail} class="item-text markdown" />
                </Show>
                <Show when={isFileChange && item.changes?.length}>
                  <div class="file-change-list">
                    <For each={item.changes}>
                      {(change, index) => (
                        <div class="file-change">
                          <div class="file-change-header">
                            <Show when={change.kind}>
                              <span class="file-change-kind">
                                {change.kind!.toUpperCase()}
                              </span>
                            </Show>
                            <span class="file-change-path">{change.path}</span>
                          </div>
                          <Show when={change.diff}>
                            <Markdown
                              value={change.diff!}
                              class="item-output markdown"
                              codeBlock
                            />
                          </Show>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>
                <Show when={isFileChange && !item.changes?.length && item.detail}>
                  <Markdown value={item.detail} class="item-text markdown" />
                </Show>
                <Show when={item.output && (!isFileChange || !item.changes?.length)}>
                  <Markdown
                    value={item.output!}
                    class="item-output markdown"
                    codeBlock
                  />
                </Show>
                <Show when={isFileChange && item.output && item.changes?.length}>
                  <Markdown
                    value={item.output!}
                    class="item-output markdown"
                    codeBlock
                  />
                </Show>
              </div>
            </details>
          );
        }}
      </For>
      <Show when={props.isThinking()}>
        <div class="thinking">Codex is thinking...</div>
      </Show>
      <Show when={!props.items().length}>
        <div class="empty messages-empty">
          Start a thread and send a prompt to the agent.
        </div>
      </Show>
      <div ref={bottomRef} />
    </div>
  );
}
