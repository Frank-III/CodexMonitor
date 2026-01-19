import { Show } from "solid-js";
import { IconButton, Tooltip } from "../ui";

type JjGraphPanelProps = {
  graph: string;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
};

export function JjGraphPanel(props: JjGraphPanelProps) {
  return (
    <aside data-component="jj-graph-panel" class="flex flex-col gap-3 p-4 flex-1 min-h-0">
      {/* Header */}
      <div data-slot="jj-graph-header" class="flex justify-between items-center">
        <span class="text-12-medium uppercase tracking-wide text-text-weak">JJ Graph</span>
        <Tooltip placement="top" value="Refresh">
          <IconButton
            icon="refresh"
            variant="ghost"
            size="normal"
            onClick={props.onRefresh}
            disabled={props.isLoading}
            aria-label="Refresh graph"
          />
        </Tooltip>
      </div>

      {/* Loading state */}
      <Show when={props.isLoading}>
        <div class="text-13-regular text-text-weak py-3">Loading…</div>
      </Show>

      {/* Error state */}
      <Show when={!props.isLoading && props.error}>
        <div class="text-12-regular text-text-on-critical-weak bg-surface-critical-weak rounded-md px-2.5 py-2">
          {props.error}
        </div>
      </Show>

      {/* Graph output */}
      <Show when={!props.isLoading && !props.error}>
        <Show when={props.graph.trim()} fallback={<div class="text-13-regular text-text-weak py-3">No graph.</div>}>
          <pre
            data-slot="jj-graph-output"
            class="font-mono text-11-regular leading-snug text-text-base whitespace-pre overflow-x-auto flex-1 min-h-0 m-0"
          >
            {props.graph}
          </pre>
        </Show>
      </Show>
    </aside>
  );
}
