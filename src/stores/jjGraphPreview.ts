import { createSignal, type Accessor } from "solid-js";
import type { WorkspaceInfo } from "../types";
import { getJjGraph } from "../services/tauri";

type JjGraphPreviewEntry = {
  graph: string;
  isLoading: boolean;
  error: string | null;
};

export type JjGraphPreviewStore = {
  entryByWorkspaceId: () => Record<string, JjGraphPreviewEntry | undefined>;
  refresh: (workspaceId: string, limit?: number) => Promise<void>;
};

export function createJjGraphPreviewStore(options: {
  workspaces: Accessor<WorkspaceInfo[]>;
}): JjGraphPreviewStore {
  const [entryByWorkspaceId, setEntryByWorkspaceId] = createSignal<
    Record<string, JjGraphPreviewEntry | undefined>
  >({});

  const refresh = async (workspaceId: string, limit = 12) => {
    const workspace = options.workspaces().find((entry) => entry.id === workspaceId);
    if (!workspace) {
      setEntryByWorkspaceId((prev) => ({
        ...prev,
        [workspaceId]: { graph: "", isLoading: false, error: "Workspace not found." },
      }));
      return;
    }

    setEntryByWorkspaceId((prev) => ({
      ...prev,
      [workspaceId]: {
        graph: prev[workspaceId]?.graph ?? "",
        isLoading: true,
        error: null,
      },
    }));

    try {
      const graph = await getJjGraph(workspaceId, limit);
      setEntryByWorkspaceId((prev) => ({
        ...prev,
        [workspaceId]: { graph, isLoading: false, error: null },
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setEntryByWorkspaceId((prev) => ({
        ...prev,
        [workspaceId]: {
          graph: prev[workspaceId]?.graph ?? "",
          isLoading: false,
          error: message,
        },
      }));
    }
  };

  return { entryByWorkspaceId, refresh };
}
