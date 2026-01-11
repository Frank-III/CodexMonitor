import { createSignal, createMemo, createEffect } from "solid-js";
import type { DebugEntry, WorkspaceInfo } from "../types";
import {
  addWorkspace as addWorkspaceService,
  connectWorkspace as connectWorkspaceService,
  listWorkspaces,
  pickWorkspacePath,
} from "../services/tauri";

export type WorkspacesStore = {
  workspaces: () => WorkspaceInfo[];
  activeWorkspace: () => WorkspaceInfo | null;
  activeWorkspaceId: () => string | null;
  setActiveWorkspaceId: (id: string | null) => void;
  addWorkspace: () => Promise<WorkspaceInfo | null>;
  connectWorkspace: (entry: WorkspaceInfo) => Promise<void>;
  markWorkspaceConnected: (id: string) => void;
  hasLoaded: () => boolean;
};

export function createWorkspacesStore(options: {
  onDebug?: (entry: DebugEntry) => void;
}): WorkspacesStore {
  const [workspaces, setWorkspaces] = createSignal<WorkspaceInfo[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = createSignal<string | null>(null);
  const [hasLoaded, setHasLoaded] = createSignal(false);
  const { onDebug } = options;

  // Load workspaces on creation
  listWorkspaces()
    .then((entries) => {
      setWorkspaces(entries);
      setActiveWorkspaceId(null);
      setHasLoaded(true);
    })
    .catch((err) => {
      console.error("Failed to load workspaces", err);
      setHasLoaded(true);
    });

  const activeWorkspace = createMemo(
    () => workspaces().find((entry) => entry.id === activeWorkspaceId()) ?? null
  );

  async function addWorkspace(): Promise<WorkspaceInfo | null> {
    const selection = await pickWorkspacePath();
    if (!selection) {
      return null;
    }
    onDebug?.({
      id: `${Date.now()}-client-add-workspace`,
      timestamp: Date.now(),
      source: "client",
      label: "workspace/add",
      payload: { path: selection },
    });
    try {
      const workspace = await addWorkspaceService(selection, null);
      setWorkspaces((prev) => [...prev, workspace]);
      setActiveWorkspaceId(workspace.id);
      return workspace;
    } catch (error) {
      onDebug?.({
        id: `${Date.now()}-client-add-workspace-error`,
        timestamp: Date.now(),
        source: "error",
        label: "workspace/add error",
        payload: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async function connectWorkspace(entry: WorkspaceInfo): Promise<void> {
    onDebug?.({
      id: `${Date.now()}-client-connect-workspace`,
      timestamp: Date.now(),
      source: "client",
      label: "workspace/connect",
      payload: { workspaceId: entry.id, path: entry.path },
    });
    try {
      await connectWorkspaceService(entry.id);
    } catch (error) {
      onDebug?.({
        id: `${Date.now()}-client-connect-workspace-error`,
        timestamp: Date.now(),
        source: "error",
        label: "workspace/connect error",
        payload: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  function markWorkspaceConnected(id: string): void {
    setWorkspaces((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, connected: true } : entry))
    );
  }

  return {
    workspaces,
    activeWorkspace,
    activeWorkspaceId,
    setActiveWorkspaceId,
    addWorkspace,
    connectWorkspace,
    markWorkspaceConnected,
    hasLoaded,
  };
}
