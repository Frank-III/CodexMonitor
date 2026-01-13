import { createEffect, createSignal, on, onCleanup, type Accessor } from "solid-js";
import type { WorktreeDivergence, WorkspaceInfo } from "../types";
import { getWorktreeDivergence, getWorkspaceDivergence } from "../services/tauri";

type WorktreeDivergenceEntry = {
  data?: WorktreeDivergence;
  isLoading: boolean;
  error: string | null;
};

export type WorktreeDivergenceStore = {
  entryByWorkspaceId: () => Record<string, WorktreeDivergenceEntry | undefined>;
  refresh: (workspaceId: string) => Promise<void>;
  refreshAll: () => Promise<void>;
};

export function createWorktreeDivergenceStore(options: {
  workspaces: Accessor<WorkspaceInfo[]>;
  activeWorkspace: Accessor<WorkspaceInfo | null>;
}): WorktreeDivergenceStore {
  const REFRESH_ACTIVE_INTERVAL_MS = 5000;
  const REFRESH_ALL_INTERVAL_MS = 20000;

  const [entryByWorkspaceId, setEntryByWorkspaceId] = createSignal<
    Record<string, WorktreeDivergenceEntry | undefined>
  >({});

  const refresh = async (workspaceId: string) => {
    const workspace = options.workspaces().find((entry) => entry.id === workspaceId);
    if (!workspace) {
      setEntryByWorkspaceId((prev) => ({
        ...prev,
        [workspaceId]: { data: prev[workspaceId]?.data, isLoading: false, error: "Workspace not found." },
      }));
      return;
    }

    setEntryByWorkspaceId((prev) => ({
      ...prev,
      [workspaceId]: {
        data: prev[workspaceId]?.data,
        isLoading: true,
        error: null,
      },
    }));

    try {
      const data =
        workspace.kind === "worktree"
          ? await getWorktreeDivergence(workspaceId)
          : await getWorkspaceDivergence(workspaceId);
      setEntryByWorkspaceId((prev) => ({
        ...prev,
        [workspaceId]: { data, isLoading: false, error: null },
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setEntryByWorkspaceId((prev) => ({
        ...prev,
        [workspaceId]: { data: prev[workspaceId]?.data, isLoading: false, error: message },
      }));
    }
  };

  const refreshAll = async () => {
    const workspaceIds = options.workspaces().map((workspace) => workspace.id);

    await Promise.allSettled(workspaceIds.map((id) => refresh(id)));
  };

  createEffect(
    on(
      () =>
        options.workspaces().map((workspace) => workspace.id).sort().join("|"),
      () => {
        const live = new Set(
          options.workspaces().map((workspace) => workspace.id),
        );

        setEntryByWorkspaceId((prev) => {
          const next: Record<string, WorktreeDivergenceEntry | undefined> = {};
          for (const [id, value] of Object.entries(prev)) {
            if (live.has(id)) {
              next[id] = value;
            }
          }
          return next;
        });

        void refreshAll();
      },
    ),
  );

  createEffect(
    on(
      options.activeWorkspace,
      (workspace) => {
        if (!workspace) {
          return;
        }

        const workspaceId = workspace.id;
        void refresh(workspaceId);

        const interval = window.setInterval(() => {
          if (document.hidden) {
            return;
          }
          const current = options.activeWorkspace();
          if (!current || current.id !== workspaceId) {
            return;
          }
          void refresh(workspaceId);
        }, REFRESH_ACTIVE_INTERVAL_MS);

        onCleanup(() => {
          window.clearInterval(interval);
        });
      },
    ),
  );

  createEffect(
    on(
      () =>
        options.workspaces().map((workspace) => workspace.id).sort().join("|"),
      () => {
        const workspaceIds = options.workspaces().map((workspace) => workspace.id);

        if (workspaceIds.length === 0) {
          return;
        }

        const interval = window.setInterval(() => {
          if (document.hidden) {
            return;
          }

          const active = options.activeWorkspace();
          const activeWorkspaceId = active?.id ?? null;
          const currentEntries = entryByWorkspaceId();

          const idsToRefresh = workspaceIds.filter((id) => {
            if (activeWorkspaceId && id === activeWorkspaceId) {
              return false;
            }
            return !currentEntries[id]?.isLoading;
          });

          if (idsToRefresh.length === 0) {
            return;
          }

          void Promise.allSettled(idsToRefresh.map((id) => refresh(id)));
        }, REFRESH_ALL_INTERVAL_MS);

        onCleanup(() => {
          window.clearInterval(interval);
        });
      },
    ),
  );

  return { entryByWorkspaceId, refresh, refreshAll };
}
