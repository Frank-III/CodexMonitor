import { createSignal, createMemo } from "solid-js";
import type { DebugEntry, WorkspaceInfo, WorktreeMode } from "../types";
import {
  addWorkspace as addWorkspaceService,
  cloneRepository as cloneRepositoryService,
  addWorktree as addWorktreeService,
  connectWorkspace as connectWorkspaceService,
  landWorktree as landWorktreeService,
  landWorktreeStack as landWorktreeStackService,
  syncWorktree as syncWorktreeService,
  syncWorktreeStack as syncWorktreeStackService,
  reparentWorktree as reparentWorktreeService,
  removeWorkspace as removeWorkspaceService,
  restoreJjOperation,
  listWorkspaces,
  pickWorkspacePath,
  updateWorktreeBaseRevset as updateWorktreeBaseRevsetService,
  updateWorkspaceBaseRevset as updateWorkspaceBaseRevsetService,
  updateWorkspaceSettings as updateWorkspaceSettingsService,
} from "../services/tauri";
import { showToast } from "../ui/Toast";

export type WorkspacesStore = {
  workspaces: () => WorkspaceInfo[];
  activeWorkspace: () => WorkspaceInfo | null;
  activeWorkspaceId: () => string | null;
  setActiveWorkspaceId: (id: string | null) => void;
  refreshWorkspaces: () => Promise<WorkspaceInfo[]>;
  addWorkspace: () => Promise<WorkspaceInfo | null>;
  cloneRepository: (url: string, destinationPath: string) => Promise<WorkspaceInfo>;
  addWorktree: (
    workspaceId: string,
    name: string,
    mode: WorktreeMode,
    baseRevset?: string | null,
  ) => Promise<WorkspaceInfo>;
  landWorktree: (id: string) => Promise<void>;
  landWorktreeStack: (id: string) => Promise<string>;
  syncWorktree: (id: string) => Promise<void>;
  syncWorktreeStack: (id: string) => Promise<void>;
  reparentWorktree: (options: {
    id: string;
    newBaseId: string;
    baseRevset: string | null;
    restack: boolean;
  }) => Promise<WorkspaceInfo>;
  updateWorktreeBaseRevset: (id: string, baseRevset: string) => Promise<WorkspaceInfo>;
  updateWorkspaceBaseRevset: (id: string, baseRevset: string) => Promise<WorkspaceInfo>;
  removeWorkspace: (id: string) => Promise<void>;
  connectWorkspace: (entry: WorkspaceInfo) => Promise<void>;
  markWorkspaceConnected: (id: string) => void;
  setWorkspaceSidebarCollapsed: (id: string, collapsed: boolean) => Promise<void>;
  setWorkspaceSpotlightEnabled: (id: string, enabled: boolean) => Promise<void>;
  renameWorkspace: (id: string, newName: string) => void;
  reorderWorkspace: (id: string, toIndex: number) => void;
  setWorkspaceTaskCommands: (
    id: string,
    commands: { setupCommand: string | null; runCommand: string | null },
  ) => Promise<void>;
  hasLoaded: () => boolean;
};

export function createWorkspacesStore(options: {
  onDebug?: (entry: DebugEntry) => void;
}): WorkspacesStore {
  const [workspaces, setWorkspaces] = createSignal<WorkspaceInfo[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = createSignal<string | null>(null);
  const [hasLoaded, setHasLoaded] = createSignal(false);
  const { onDebug } = options;

  async function refreshWorkspaces(): Promise<WorkspaceInfo[]> {
    try {
      const entries = await listWorkspaces();
      setWorkspaces(entries);
      const currentActive = activeWorkspaceId();
      if (currentActive && !entries.some((entry) => entry.id === currentActive)) {
        setActiveWorkspaceId(null);
      }
      setHasLoaded(true);
      return entries;
    } catch (err) {
      console.error("Failed to load workspaces", err);
      setHasLoaded(true);
      throw err;
    }
  }

  void refreshWorkspaces().catch(() => {});

  const activeWorkspace = createMemo(
    () => workspaces().find((entry) => entry.id === activeWorkspaceId()) ?? null
  );

  async function addWorkspace(): Promise<WorkspaceInfo | null> {
    const selection = await pickWorkspacePath();
    if (!selection) {
      return null;
    }
    return addWorkspaceAtPath(selection);
  }

  async function addWorkspaceAtPath(path: string): Promise<WorkspaceInfo> {
    onDebug?.({
      id: `${Date.now()}-client-add-workspace`,
      timestamp: Date.now(),
      source: "client",
      label: "workspace/add",
      payload: { path },
    });
    try {
      const workspace = await addWorkspaceService(path, null);
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

  async function cloneRepository(url: string, destinationPath: string): Promise<WorkspaceInfo> {
    onDebug?.({
      id: `${Date.now()}-client-clone-repo`,
      timestamp: Date.now(),
      source: "client",
      label: "workspace/clone",
      payload: { url, destinationPath },
    });

    try {
      const clonedPath = await cloneRepositoryService(url, destinationPath);
      return await addWorkspaceAtPath(clonedPath);
    } catch (error) {
      onDebug?.({
        id: `${Date.now()}-client-clone-repo-error`,
        timestamp: Date.now(),
        source: "error",
        label: "workspace/clone error",
        payload: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async function addWorktree(
    workspaceId: string,
    name: string,
    mode: WorktreeMode,
    baseRevset?: string | null,
  ): Promise<WorkspaceInfo> {
    onDebug?.({
      id: `${Date.now()}-client-add-worktree`,
      timestamp: Date.now(),
      source: "client",
      label: "workspace/addWorktree",
      payload: { workspaceId, name, mode, baseRevset: baseRevset ?? null },
    });
    try {
      const workspace = await addWorktreeService(workspaceId, name, mode, baseRevset);
      setWorkspaces((prev) => [...prev, workspace]);
      setActiveWorkspaceId(workspace.id);
      return workspace;
    } catch (error) {
      onDebug?.({
        id: `${Date.now()}-client-add-worktree-error`,
        timestamp: Date.now(),
        source: "error",
        label: "workspace/addWorktree error",
        payload: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async function landWorktree(id: string): Promise<void> {
    const entry = workspaces().find((workspace) => workspace.id === id);
    if (!entry) {
      return;
    }

    const destinationEntry = workspaces().find(
      (workspace) => workspace.id === (entry.base_id ?? entry.parent_id),
    );

    onDebug?.({
      id: `${Date.now()}-client-worktree-land`,
      timestamp: Date.now(),
      source: "client",
      label: "worktree/land",
      payload: { workspaceId: id, destination: entry.base_id ?? entry.parent_id ?? null },
    });

    const landResult = await landWorktreeService(id);

    setWorkspaces((prev) => prev.filter((workspace) => workspace.id !== id));
    if (activeWorkspaceId() === id) {
      setActiveWorkspaceId(landResult.destinationId ?? null);
    }

    // Show undo toast with 10 second duration
    showToast({
      title: "Landed worktree",
      description: `Changes squashed into ${destinationEntry?.name ?? "destination"}`,
      variant: "success",
      duration: 10000,
      actions: [
        {
          label: "Undo",
          onClick: async () => {
            try {
              await restoreJjOperation(landResult.destinationId, landResult.previousOpId);
              showToast({
                title: "Undo complete",
                description: "Operation restored to previous state",
                variant: "success",
                duration: 3000,
              });
              // Refresh workspaces after undo (worktree will need to be re-added manually)
              await refreshWorkspaces();
            } catch (err) {
              showToast({
                title: "Undo failed",
                description: err instanceof Error ? err.message : String(err),
                variant: "error",
                duration: 5000,
              });
            }
          },
        },
      ],
    });
  }

  async function syncWorktree(id: string): Promise<void> {
    const entry = workspaces().find((workspace) => workspace.id === id);
    if (!entry) {
      return;
    }

    onDebug?.({
      id: `${Date.now()}-client-worktree-sync`,
      timestamp: Date.now(),
      source: "client",
      label: "worktree/sync",
      payload: { workspaceId: id, baseRevset: entry.base_revset ?? null },
    });

    const syncResult = await syncWorktreeService(id);

    // Show undo toast with 10 second duration
    showToast({
      title: "Synced worktree",
      description: `${entry.name} rebased onto base`,
      variant: "success",
      duration: 10000,
      actions: [
        {
          label: "Undo",
          onClick: async () => {
            try {
              await restoreJjOperation(id, syncResult.previousOpId);
              showToast({
                title: "Undo complete",
                description: "Sync operation reverted",
                variant: "success",
                duration: 3000,
              });
            } catch (err) {
              showToast({
                title: "Undo failed",
                description: err instanceof Error ? err.message : String(err),
                variant: "error",
                duration: 5000,
              });
            }
          },
        },
      ],
    });
  }

  async function syncWorktreeStack(id: string): Promise<void> {
    const entry = workspaces().find((workspace) => workspace.id === id);
    if (!entry) {
      return;
    }

    onDebug?.({
      id: `${Date.now()}-client-worktree-sync-stack`,
      timestamp: Date.now(),
      source: "client",
      label: "worktree/syncStack",
      payload: { workspaceId: id },
    });

    await syncWorktreeStackService(id);
  }

  async function landWorktreeStack(id: string): Promise<string> {
    const entry = workspaces().find((workspace) => workspace.id === id);
    if (!entry) {
      throw new Error("Workspace not found.");
    }

    onDebug?.({
      id: `${Date.now()}-client-worktree-land-stack`,
      timestamp: Date.now(),
      source: "client",
      label: "worktree/landStack",
      payload: { workspaceId: id },
    });

    const previousActive = activeWorkspaceId();
    const destinationId = await landWorktreeStackService(id);

    const nextEntries = await refreshWorkspaces();
    if (previousActive && !nextEntries.some((workspace) => workspace.id === previousActive)) {
      setActiveWorkspaceId(destinationId);
    }

    return destinationId;
  }

  async function reparentWorktree(options: {
    id: string;
    newBaseId: string;
    baseRevset: string | null;
    restack: boolean;
  }): Promise<WorkspaceInfo> {
    onDebug?.({
      id: `${Date.now()}-client-worktree-reparent`,
      timestamp: Date.now(),
      source: "client",
      label: "worktree/reparent",
      payload: options,
    });

    const updated = await reparentWorktreeService(options);
    setWorkspaces((prev) =>
      prev.map((entry) => (entry.id === options.id ? updated : entry)),
    );
    return updated;
  }

  async function updateWorktreeBaseRevset(
    id: string,
    baseRevset: string,
  ): Promise<WorkspaceInfo> {
    onDebug?.({
      id: `${Date.now()}-client-worktree-baseRevset`,
      timestamp: Date.now(),
      source: "client",
      label: "worktree/updateBaseRevset",
      payload: { workspaceId: id, baseRevset },
    });

    const updated = await updateWorktreeBaseRevsetService(id, baseRevset);
    setWorkspaces((prev) =>
      prev.map((entry) => (entry.id === id ? updated : entry)),
    );
    return updated;
  }

  async function updateWorkspaceBaseRevset(
    id: string,
    baseRevset: string,
  ): Promise<WorkspaceInfo> {
    onDebug?.({
      id: `${Date.now()}-client-workspace-baseRevset`,
      timestamp: Date.now(),
      source: "client",
      label: "workspace/updateBaseRevset",
      payload: { workspaceId: id, baseRevset },
    });

    const updated = await updateWorkspaceBaseRevsetService(id, baseRevset);
    setWorkspaces((prev) =>
      prev.map((entry) => (entry.id === id ? updated : entry)),
    );
    return updated;
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

  async function removeWorkspace(id: string): Promise<void> {
    onDebug?.({
      id: `${Date.now()}-client-remove-workspace`,
      timestamp: Date.now(),
      source: "client",
      label: "workspace/remove",
      payload: { workspaceId: id },
    });
    try {
      await removeWorkspaceService(id);
      setWorkspaces((prev) => prev.filter((entry) => entry.id !== id));
      if (activeWorkspaceId() === id) {
        setActiveWorkspaceId(null);
      }
    } catch (error) {
      onDebug?.({
        id: `${Date.now()}-client-remove-workspace-error`,
        timestamp: Date.now(),
        source: "error",
        label: "workspace/remove error",
        payload: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  function renameWorkspace(id: string, newName: string): void {
    const trimmed = newName.trim();
    if (!trimmed) return;

    onDebug?.({
      id: `${Date.now()}-client-rename-workspace`,
      timestamp: Date.now(),
      source: "client",
      label: "workspace/rename",
      payload: { workspaceId: id, newName: trimmed },
    });

    setWorkspaces((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, name: trimmed } : entry)),
    );
  }

  function reorderWorkspace(id: string, toIndex: number): void {
    const mainWorkspaces = workspaces()
      .filter((w) => w.kind === "main")
      .sort((a, b) => {
        const orderA = a.settings.sort_order ?? 0;
        const orderB = b.settings.sort_order ?? 0;
        if (orderA !== orderB) return orderA - orderB;
        return a.name.localeCompare(b.name);
      });

    const fromIndex = mainWorkspaces.findIndex((w) => w.id === id);
    if (fromIndex === -1 || fromIndex === toIndex) return;

    onDebug?.({
      id: `${Date.now()}-client-reorder-workspace`,
      timestamp: Date.now(),
      source: "client",
      label: "workspace/reorder",
      payload: { workspaceId: id, fromIndex, toIndex },
    });

    const reordered = [...mainWorkspaces];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    const updates: { id: string; order: number }[] = [];
    reordered.forEach((w, idx) => {
      updates.push({ id: w.id, order: idx });
    });

    setWorkspaces((prev) =>
      prev.map((entry) => {
        const update = updates.find((u) => u.id === entry.id);
        if (!update) return entry;
        return { ...entry, settings: { ...entry.settings, sort_order: update.order } };
      }),
    );
  }

  async function setWorkspaceSidebarCollapsed(
    id: string,
    collapsed: boolean,
  ): Promise<void> {
    const current = workspaces().find((entry) => entry.id === id);
    if (!current) {
      return;
    }

    onDebug?.({
      id: `${Date.now()}-client-workspace-settings`,
      timestamp: Date.now(),
      source: "client",
      label: "workspace/updateSettings",
      payload: { workspaceId: id, sidebarCollapsed: collapsed },
    });

    const updated = await updateWorkspaceSettingsService(id, {
      ...current.settings,
      sidebar_collapsed: collapsed,
    });
    setWorkspaces((prev) =>
      prev.map((entry) => (entry.id === id ? updated : entry)),
    );
  }

  async function setWorkspaceSpotlightEnabled(
    id: string,
    enabled: boolean,
  ): Promise<void> {
    const current = workspaces().find((entry) => entry.id === id);
    if (!current) {
      return;
    }

    onDebug?.({
      id: `${Date.now()}-client-workspace-settings-spotlight`,
      timestamp: Date.now(),
      source: "client",
      label: "workspace/updateSettings",
      payload: { workspaceId: id, spotlightEnabled: enabled },
    });

    const updated = await updateWorkspaceSettingsService(id, {
      ...current.settings,
      spotlight_enabled: enabled,
    });
    setWorkspaces((prev) => prev.map((entry) => (entry.id === id ? updated : entry)));
  }

  async function setWorkspaceTaskCommands(
    id: string,
    commands: { setupCommand: string | null; runCommand: string | null },
  ): Promise<void> {
    const current = workspaces().find((entry) => entry.id === id);
    if (!current) {
      return;
    }

    const normalize = (value: string | null) => {
      const trimmed = value?.trim() ?? "";
      return trimmed ? trimmed : null;
    };

    onDebug?.({
      id: `${Date.now()}-client-workspace-settings-commands`,
      timestamp: Date.now(),
      source: "client",
      label: "workspace/updateSettings",
      payload: {
        workspaceId: id,
        setupCommand: normalize(commands.setupCommand),
        runCommand: normalize(commands.runCommand),
      },
    });

    const updated = await updateWorkspaceSettingsService(id, {
      ...current.settings,
      setup_command: normalize(commands.setupCommand),
      run_command: normalize(commands.runCommand),
    });
    setWorkspaces((prev) => prev.map((entry) => (entry.id === id ? updated : entry)));
  }

  return {
    workspaces,
    activeWorkspace,
    activeWorkspaceId,
    setActiveWorkspaceId,
    refreshWorkspaces,
    addWorkspace,
    cloneRepository,
    addWorktree,
    landWorktree,
    landWorktreeStack,
    syncWorktree,
    syncWorktreeStack,
    reparentWorktree,
    updateWorktreeBaseRevset,
    updateWorkspaceBaseRevset,
    removeWorkspace,
    connectWorkspace,
    markWorkspaceConnected,
    setWorkspaceSidebarCollapsed,
    setWorkspaceSpotlightEnabled,
    setWorkspaceTaskCommands,
    renameWorkspace,
    reorderWorkspace,
    hasLoaded,
  };
}
