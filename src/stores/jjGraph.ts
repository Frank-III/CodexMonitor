import { createEffect, createSignal, on, type Accessor } from "solid-js";
import type { WorkspaceInfo } from "../types";
import { getJjGraph } from "../services/tauri";

type JjGraphState = {
  graph: string;
  isLoading: boolean;
  error: string | null;
};

const emptyState: JjGraphState = { graph: "", isLoading: false, error: null };

export type JjGraphStore = {
  state: () => JjGraphState;
  refresh: () => Promise<void>;
};

export function createJjGraphStore(options: {
  activeWorkspace: Accessor<WorkspaceInfo | null>;
  enabled: Accessor<boolean>;
  limit?: Accessor<number | undefined>;
}): JjGraphStore {
  const [state, setState] = createSignal<JjGraphState>(emptyState);

  const load = async () => {
    const workspace = options.activeWorkspace();
    if (!workspace) {
      setState(emptyState);
      return;
    }

    const limit = options.limit?.();
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const graph = await getJjGraph(workspace.id, limit);
      setState({ graph, isLoading: false, error: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState({ graph: "", isLoading: false, error: message });
    }
  };

  const refresh = async () => {
    if (!options.enabled()) {
      return;
    }
    await load();
  };

  createEffect(
    on(
      () => [options.enabled(), options.activeWorkspace()?.id ?? null] as const,
      ([enabled]) => {
        if (!enabled) {
          setState(emptyState);
          return;
        }
        void load();
      },
    ),
  );

  return { state, refresh };
}

