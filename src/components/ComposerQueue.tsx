import { For, Show, type Accessor } from "solid-js";
import type { QueuedMessage } from "../types";

type ComposerQueueProps = {
  items: Accessor<QueuedMessage[]>;
  onRemove: (id: string) => void;
  onClear?: () => void;
};

function describeQueuedItem(item: QueuedMessage) {
  const text = item.text.trim();
  const attachments = item.attachments ?? [];
  if (!text && attachments.length > 0) {
    return attachments.length === 1 ? "Attachment" : `Attachments (${attachments.length})`;
  }
  if (attachments.length === 0) {
    return text;
  }
  const suffix = attachments.length === 1 ? "· 1 attachment" : `· ${attachments.length} attachments`;
  return `${text} ${suffix}`;
}

export function ComposerQueue(props: ComposerQueueProps) {
  return (
    <Show when={props.items().length > 0}>
      <div class="composer-queue">
        <div class="composer-queue-header">
          <div class="composer-queue-title">Queued</div>
          <div class="composer-queue-actions">
            <div class="composer-queue-count">{props.items().length}</div>
            <Show when={props.onClear}>
              <button
                type="button"
                class="composer-queue-clear"
                onClick={() => props.onClear?.()}
              >
                Clear
              </button>
            </Show>
          </div>
        </div>
        <div class="composer-queue-list">
          <For each={props.items()}>
            {(item) => (
              <div class="composer-queue-item">
                <span class="composer-queue-text">{describeQueuedItem(item)}</span>
                <button
                  type="button"
                  class="composer-queue-remove"
                  onClick={() => props.onRemove(item.id)}
                  aria-label="Remove queued message"
                  title="Remove"
                >
                  ×
                </button>
              </div>
            )}
          </For>
        </div>
      </div>
    </Show>
  );
}

