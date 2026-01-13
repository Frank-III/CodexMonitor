import { Show } from "solid-js";

type JjGraphPanelProps = {
  graph: string;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
};

export function JjGraphPanel(props: JjGraphPanelProps) {
  return (
    <aside class="graph-panel">
      <div class="graph-header">
        <span>JJ Graph</span>
        <button
          type="button"
          class="ghost issues-refresh"
          onClick={props.onRefresh}
          disabled={props.isLoading}
          aria-label="Refresh graph"
          title="Refresh"
        >
          ↻
        </button>
      </div>

      <Show when={props.isLoading}>
        <div class="graph-empty">Loading…</div>
      </Show>

      <Show when={!props.isLoading && props.error}>
        <div class="graph-error">{props.error}</div>
      </Show>

      <Show when={!props.isLoading && !props.error}>
        <Show when={props.graph.trim()} fallback={<div class="graph-empty">No graph.</div>}>
          <pre class="graph-output">{props.graph}</pre>
        </Show>
      </Show>
    </aside>
  );
}

