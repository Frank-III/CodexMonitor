import { createEffect, createSignal, on } from "solid-js";
import type { JjBookmarkInfo, WorkspaceInfo } from "../types";
import {
  deleteJjBookmark,
  jjGitFetch,
  jjGitPushBookmark,
  jjGitPushDeleted,
  jjGitPushTracked,
  listJjBookmarks,
  renameJjBookmark,
  trackJjRemoteBookmark,
  untrackJjRemoteBookmark,
  setJjBookmark,
} from "../services/tauri";

type JjBookmarksState = {
  bookmarks: JjBookmarkInfo[];
  isLoading: boolean;
  error: string | null;
};

const emptyState: JjBookmarksState = {
  bookmarks: [],
  isLoading: false,
  error: null,
};

export type JjBookmarksStore = {
  state: () => JjBookmarksState;
  refresh: () => Promise<void>;
  setBookmark: (name: string, targetRevset: string) => Promise<void>;
  deleteBookmark: (name: string) => Promise<void>;
  renameBookmark: (oldName: string, newName: string) => Promise<void>;
  fetchRemote: (remote?: string) => Promise<string>;
  pushBookmark: (name: string, remote?: string) => Promise<string>;
  pushTracked: (remote?: string) => Promise<string>;
  pushDeleted: (remote?: string) => Promise<string>;
  trackRemoteBookmark: (name: string, remote: string) => Promise<void>;
  untrackRemoteBookmark: (name: string, remote: string) => Promise<void>;
};

export function createJjBookmarksStore(
  activeWorkspace: () => WorkspaceInfo | null | undefined,
  enabled: () => boolean,
): JjBookmarksStore {
  const [state, setState] = createSignal<JjBookmarksState>(emptyState);
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
      const bookmarks = await listJjBookmarks(workspace.id);

      if (requestId !== currentRequestId || lastWorkspaceId !== workspace.id) {
        return;
      }

      setState({ bookmarks, isLoading: false, error: null });
    } catch (err) {
      console.error("Failed to load JJ bookmarks", err);

      if (requestId !== currentRequestId || lastWorkspaceId !== workspace.id) {
        return;
      }

      setState({
        bookmarks: [],
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
        if (!isEnabled) {
          return;
        }
        void refresh();
      },
    ),
  );

  async function setBookmark(name: string, targetRevset: string): Promise<void> {
    const workspace = activeWorkspace();
    if (!workspace) {
      throw new Error("No active workspace.");
    }
    await setJjBookmark(workspace.id, name, targetRevset);
    await refresh();
  }

  async function deleteBookmark(name: string): Promise<void> {
    const workspace = activeWorkspace();
    if (!workspace) {
      throw new Error("No active workspace.");
    }
    await deleteJjBookmark(workspace.id, name);
    await refresh();
  }

  async function renameBookmark(oldName: string, newName: string): Promise<void> {
    const workspace = activeWorkspace();
    if (!workspace) {
      throw new Error("No active workspace.");
    }
    await renameJjBookmark(workspace.id, oldName, newName);
    await refresh();
  }

  async function fetchRemote(remote?: string): Promise<string> {
    const workspace = activeWorkspace();
    if (!workspace) {
      throw new Error("No active workspace.");
    }
    const output = await jjGitFetch(workspace.id, remote);
    await refresh();
    return output;
  }

  async function pushBookmark(name: string, remote?: string): Promise<string> {
    const workspace = activeWorkspace();
    if (!workspace) {
      throw new Error("No active workspace.");
    }
    const output = await jjGitPushBookmark(workspace.id, name, remote);
    await refresh();
    return output;
  }

  async function pushTracked(remote?: string): Promise<string> {
    const workspace = activeWorkspace();
    if (!workspace) {
      throw new Error("No active workspace.");
    }
    const output = await jjGitPushTracked(workspace.id, remote);
    await refresh();
    return output;
  }

  async function pushDeleted(remote?: string): Promise<string> {
    const workspace = activeWorkspace();
    if (!workspace) {
      throw new Error("No active workspace.");
    }
    const output = await jjGitPushDeleted(workspace.id, remote);
    await refresh();
    return output;
  }

  async function trackRemoteBookmark(name: string, remote: string): Promise<void> {
    const workspace = activeWorkspace();
    if (!workspace) {
      throw new Error("No active workspace.");
    }
    await trackJjRemoteBookmark(workspace.id, name, remote);
    await refresh();
  }

  async function untrackRemoteBookmark(name: string, remote: string): Promise<void> {
    const workspace = activeWorkspace();
    if (!workspace) {
      throw new Error("No active workspace.");
    }
    await untrackJjRemoteBookmark(workspace.id, name, remote);
    await refresh();
  }

  return {
    state,
    refresh,
    setBookmark,
    deleteBookmark,
    renameBookmark,
    fetchRemote,
    pushBookmark,
    pushTracked,
    pushDeleted,
    trackRemoteBookmark,
    untrackRemoteBookmark,
  };
}
