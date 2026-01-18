import { createSignal, createEffect, on, onCleanup } from "solid-js";
import type { GitHubIssue, WorkspaceInfo } from "../types";
import { getGitHubIssues } from "../services/tauri";

type GitHubIssuesState = {
  total: number;
  issues: GitHubIssue[];
  isLoading: boolean;
  error: string | null;
};

const emptyState: GitHubIssuesState = {
  total: 0,
  issues: [],
  isLoading: false,
  error: null,
};

const REFRESH_INTERVAL_MS = 30_000;

export type GitHubIssuesStore = {
  state: () => GitHubIssuesState;
  refresh: () => Promise<void>;
};

export function createGitHubIssuesStore(options: {
  activeWorkspace: () => WorkspaceInfo | null | undefined;
  enabled: () => boolean;
}): GitHubIssuesStore {
  const [state, setState] = createSignal<GitHubIssuesState>(emptyState);
  let requestId = 0;
  let lastWorkspaceId: string | undefined;

  async function refresh(): Promise<void> {
    const workspace = options.activeWorkspace();
    if (!workspace || !workspace.connected) {
      setState(emptyState);
      return;
    }

    const currentRequestId = ++requestId;
    lastWorkspaceId = workspace.id;
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await getGitHubIssues(workspace.id);

      if (requestId !== currentRequestId || lastWorkspaceId !== workspace.id) {
        return;
      }

      setState({
        total: response.total,
        issues: response.issues,
        isLoading: false,
        error: null,
      });
    } catch (err) {
      if (requestId !== currentRequestId || lastWorkspaceId !== workspace.id) {
        return;
      }

      setState({
        total: 0,
        issues: [],
        isLoading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  createEffect(
    on(
      () => options.activeWorkspace()?.id,
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
    on([options.enabled, options.activeWorkspace], ([enabled]) => {
      if (!enabled) {
        return;
      }

      void refresh();
      const interval = window.setInterval(() => {
        void refresh();
      }, REFRESH_INTERVAL_MS);

      onCleanup(() => {
        window.clearInterval(interval);
      });
    }),
  );

  return {
    state,
    refresh,
  };
}

