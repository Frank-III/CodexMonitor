import { batch } from "solid-js";
import { createStore, produce } from "solid-js/store";
import type { WorkspaceFileContent } from "../types";
import { readWorkspaceFileText } from "../services/tauri";

export type FileTab = {
  id: string;
  path: string;
  name: string;
  content: WorkspaceFileContent | null;
  isLoading: boolean;
  error: string | null;
  scrollY: number;
};

type WorkspaceFileTabs = {
  active: string | undefined;
  tabs: FileTab[];
};

const DEFAULT_MAX_BYTES = 1024 * 1024;

export type FileTabsStore = {
  tabs: (workspaceId: string) => FileTab[];
  active: (workspaceId: string) => string | undefined;
  activeTab: (workspaceId: string) => FileTab | undefined;
  open: (workspaceId: string, path: string) => void;
  close: (workspaceId: string, tabId: string) => void;
  select: (workspaceId: string, tabId: string) => void;
  move: (workspaceId: string, tabId: string, toIndex: number) => void;
  refresh: (workspaceId: string, tabId: string) => Promise<void>;
  setScrollY: (workspaceId: string, tabId: string, scrollY: number) => void;
};

export function createFileTabsStore(): FileTabsStore {
  const [store, setStore] = createStore<Record<string, WorkspaceFileTabs>>({});
  const inFlightLoads = new Map<string, Promise<void>>();

  const ensureWorkspace = (workspaceId: string) => {
    if (!store[workspaceId]) {
      setStore(workspaceId, { active: undefined, tabs: [] });
    }
  };

  const getFilename = (path: string): string => {
    const lastSlash = path.lastIndexOf("/");
    if (lastSlash === -1) return path;
    return path.substring(lastSlash + 1);
  };

  const loadFile = async (workspaceId: string, tabId: string, path: string) => {
    const key = `${workspaceId}:${tabId}`;
    const existing = inFlightLoads.get(key);
    if (existing) return existing;

    const promise = (async () => {
      setStore(workspaceId, "tabs", (tabs) =>
        tabs.map((t) => (t.id === tabId ? { ...t, isLoading: true, error: null } : t))
      );

      try {
        const content = await readWorkspaceFileText(workspaceId, path, DEFAULT_MAX_BYTES);
        setStore(workspaceId, "tabs", (tabs) =>
          tabs.map((t) => (t.id === tabId ? { ...t, content, isLoading: false, error: null } : t))
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setStore(workspaceId, "tabs", (tabs) =>
          tabs.map((t) => (t.id === tabId ? { ...t, content: null, isLoading: false, error: message } : t))
        );
      } finally {
        inFlightLoads.delete(key);
      }
    })();

    inFlightLoads.set(key, promise);
    return promise;
  };

  const tabs = (workspaceId: string) => store[workspaceId]?.tabs ?? [];

  const active = (workspaceId: string) => store[workspaceId]?.active;

  const activeTab = (workspaceId: string) => {
    const workspace = store[workspaceId];
    if (!workspace?.active) return undefined;
    return workspace.tabs.find((t) => t.id === workspace.active);
  };

  const open = (workspaceId: string, path: string) => {
    ensureWorkspace(workspaceId);
    const workspace = store[workspaceId];

    const existingTab = workspace.tabs.find((t) => t.path === path);
    if (existingTab) {
      setStore(workspaceId, "active", existingTab.id);
      return;
    }

    const tabId = `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const newTab: FileTab = {
      id: tabId,
      path,
      name: getFilename(path),
      content: null,
      isLoading: false,
      error: null,
      scrollY: 0,
    };

    batch(() => {
      setStore(workspaceId, "tabs", [...workspace.tabs, newTab]);
      setStore(workspaceId, "active", tabId);
    });

    void loadFile(workspaceId, tabId, path);
  };

  const close = (workspaceId: string, tabId: string) => {
    ensureWorkspace(workspaceId);
    const workspace = store[workspaceId];
    const index = workspace.tabs.findIndex((t) => t.id === tabId);
    if (index === -1) return;

    batch(() => {
      setStore(
        workspaceId,
        "tabs",
        workspace.tabs.filter((t) => t.id !== tabId)
      );

      if (workspace.active === tabId) {
        const remaining = workspace.tabs.filter((t) => t.id !== tabId);
        const newActive = remaining[Math.max(0, index - 1)]?.id;
        setStore(workspaceId, "active", newActive);
      }
    });
  };

  const select = (workspaceId: string, tabId: string) => {
    ensureWorkspace(workspaceId);
    setStore(workspaceId, "active", tabId);
  };

  const move = (workspaceId: string, tabId: string, toIndex: number) => {
    ensureWorkspace(workspaceId);
    const workspace = store[workspaceId];
    const fromIndex = workspace.tabs.findIndex((t) => t.id === tabId);
    if (fromIndex === -1) return;

    setStore(
      workspaceId,
      "tabs",
      produce((tabs) => {
        tabs.splice(toIndex, 0, tabs.splice(fromIndex, 1)[0]);
      })
    );
  };

  const refresh = async (workspaceId: string, tabId: string) => {
    const workspace = store[workspaceId];
    const tab = workspace?.tabs.find((t) => t.id === tabId);
    if (!tab) return;
    await loadFile(workspaceId, tabId, tab.path);
  };

  const setScrollY = (workspaceId: string, tabId: string, scrollY: number) => {
    ensureWorkspace(workspaceId);
    setStore(workspaceId, "tabs", (tabs) =>
      tabs.map((t) => (t.id === tabId ? { ...t, scrollY } : t))
    );
  };

  return {
    tabs,
    active,
    activeTab,
    open,
    close,
    select,
    move,
    refresh,
    setScrollY,
  };
}
