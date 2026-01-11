import { createSignal, createEffect, onCleanup } from "solid-js";
import type { GitFileStatus, WorkspaceInfo } from "../types";
import { getGitStatus } from "../services/tauri";

type GitStatusState = {
  branchName: string;
  files: GitFileStatus[];
  totalAdditions: number;
  totalDeletions: number;
  error: string | null;
};

const emptyStatus: GitStatusState = {
  branchName: "",
  files: [],
  totalAdditions: 0,
  totalDeletions: 0,
  error: null,
};

const REFRESH_INTERVAL_MS = 3000;

export type GitStatusStore = {
  status: () => GitStatusState;
  refresh: () => Promise<void>;
};

export function createGitStatusStore(
  activeWorkspace: () => WorkspaceInfo | null
): GitStatusStore {
  const [status, setStatus] = createSignal<GitStatusState>(emptyStatus);

  async function refresh(): Promise<void> {
    const workspace = activeWorkspace();
    if (!workspace) {
      setStatus(emptyStatus);
      return;
    }
    try {
      const data = await getGitStatus(workspace.id);
      setStatus({ ...data, error: null });
    } catch (err) {
      console.error("Failed to load git status", err);
      setStatus({
        ...emptyStatus,
        branchName: "unknown",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Auto-refresh when workspace changes and periodically
  createEffect(() => {
    const workspace = activeWorkspace();
    if (!workspace) {
      setStatus(emptyStatus);
      return;
    }

    refresh();
    const interval = window.setInterval(() => refresh(), REFRESH_INTERVAL_MS);

    onCleanup(() => {
      window.clearInterval(interval);
    });
  });

  return { status, refresh };
}
