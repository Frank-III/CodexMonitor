import { createSignal, createEffect, on, onCleanup } from "solid-js";
import type { VcsFileStatus, WorkspaceInfo } from "../types";
import { getVcsStatus } from "../services/tauri";

type VcsStatusState = {
  branchName: string;
  files: VcsFileStatus[];
  totalAdditions: number;
  totalDeletions: number;
  error: string | null;
};

const emptyStatus: VcsStatusState = {
  branchName: "",
  files: [],
  totalAdditions: 0,
  totalDeletions: 0,
  error: null,
};

const REFRESH_INTERVAL_MS = 3000;

export type VcsStatusStore = {
  status: () => VcsStatusState;
  refresh: () => Promise<void>;
};

export function createVcsStatusStore(
  activeWorkspace: () => WorkspaceInfo | null | undefined
): VcsStatusStore {
  const [status, setStatus] = createSignal<VcsStatusState>(emptyStatus);

  async function refresh(): Promise<void> {
    const workspace = activeWorkspace();
    if (!workspace) {
      setStatus(emptyStatus);
      return;
    }
    try {
      const data = await getVcsStatus(workspace.id);
      setStatus({ ...data, error: null });
    } catch (err) {
      console.error("Failed to load vcs status", err);
      setStatus({
        ...emptyStatus,
        branchName: "unknown",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  createEffect(
    on(activeWorkspace, (workspace) => {
      if (!workspace) {
        setStatus(emptyStatus);
        return;
      }

      refresh();
      const interval = window.setInterval(() => refresh(), REFRESH_INTERVAL_MS);

      onCleanup(() => {
        window.clearInterval(interval);
      });
    })
  );

  return { status, refresh };
}
