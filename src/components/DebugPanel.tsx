import { For, Show, type Accessor } from "solid-js";
import type { DebugEntry } from "../types";

type DebugPanelProps = {
  entries: Accessor<DebugEntry[]>;
  isOpen: Accessor<boolean>;
  onToggle: () => void;
  onClear: () => void;
  onCopy: () => void;
};

function formatPayload(payload: unknown) {
  if (payload === undefined) {
    return "";
  }
  if (typeof payload === "string") {
    return payload;
  }
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

export function DebugPanel(props: DebugPanelProps) {
  return (
    <Show when={props.isOpen()}>
      <section class="debug-panel open">
        <div class="debug-header">
          <div class="debug-title">Debug</div>
          <div class="debug-actions">
            <button class="ghost" onClick={props.onCopy}>
              Copy
            </button>
            <button class="ghost" onClick={props.onClear}>
              Clear
            </button>
          </div>
        </div>
        <div class="debug-list">
          <Show when={props.entries().length === 0}>
            <div class="debug-empty">No debug events yet.</div>
          </Show>
          <For each={props.entries()}>
            {(entry) => (
              <div class="debug-row">
                <div class="debug-meta">
                  <span class={`debug-source ${entry.source}`}>
                    {entry.source}
                  </span>
                  <span class="debug-time">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </span>
                  <span class="debug-label">{entry.label}</span>
                </div>
                <Show when={entry.payload !== undefined}>
                  <pre class="debug-payload">
                    {formatPayload(entry.payload)}
                  </pre>
                </Show>
              </div>
            )}
          </For>
        </div>
      </section>
    </Show>
  );
}
