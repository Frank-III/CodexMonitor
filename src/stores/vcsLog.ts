import { createSignal, createEffect, on } from "solid-js";
import type { VcsLogEntry, WorkspaceInfo } from "../types";
import { getVcsLog } from "../services/tauri";

type VcsLogState = {
  entries: VcsLogEntry[];
  total: number;
  isLoading: boolean;
  error: string | null;
};

const emptyState: VcsLogState = {
  entries: [],
  total: 0,
  isLoading: false,
  error: null,
};

export type VcsLogStore = {
  state: () => VcsLogState;
  refresh: () => Promise<void>;
};

export function createVcsLogStore(
  activeWorkspace: () => WorkspaceInfo | undefined,
  enabled: () => boolean,
): VcsLogStore {
  const [state, setState] = createSignal<VcsLogState>(emptyState);
  let requestId = 0;
  let lastWorkspaceId: string | undefined;

  async function refresh(): Promise<void> {
    const workspace = activeWorkspace();
    if (!workspace) {
      setState(emptyState);
      return;
    }

    const currentRequestId = ++requestId;
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await getVcsLog(workspace.id);

      if (requestId !== currentRequestId || lastWorkspaceId !== workspace.id) {
        return;
      }

      setState({
        entries: response.entries,
        total: response.total,
        isLoading: false,
        error: null,
      });
    } catch (err) {
      console.error("Failed to load vcs log", err);

      if (requestId !== currentRequestId || lastWorkspaceId !== workspace.id) {
        return;
      }

      setState({
        entries: [],
        total: 0,
        isLoading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  createEffect(
    on(
      () => activeWorkspace()?.id,
      (workspaceId) => {
        if (lastWorkspaceId !== workspaceId) {
          lastWorkspaceId = workspaceId;
          requestId++;
          setState(emptyState);
        }
      },
    ),
  );

  createEffect(
    on(
      [enabled, activeWorkspace],
      ([isEnabled]) => {
        if (!isEnabled) return;
        refresh();
      },
    ),
  );

  return { state, refresh };
}
