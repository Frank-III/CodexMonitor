import { createSignal, onCleanup, batch } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { listen } from "@tauri-apps/api/event";
import type { DebugEntry, TerminalOutputEvent } from "../types";
import { terminalClose, terminalOpen, terminalResize, terminalWrite } from "../services/tauri";

export type LocalTerminal = {
  id: string;
  title: string;
  titleNumber: number;
  rows?: number;
  cols?: number;
  isOpen: boolean;
  isOpening: boolean;
  error: string | null;
};

export type MultiTerminalStore = {
  ready: () => boolean;
  all: (workspaceId: string) => LocalTerminal[];
  active: (workspaceId: string) => string | undefined;
  bufferFor: (workspaceId: string, terminalId: string) => string;
  clearBuffer: (workspaceId: string, terminalId: string) => void;
  new: (workspaceId: string) => Promise<string>;
  open: (workspaceId: string, terminalId: string) => void;
  close: (workspaceId: string, terminalId: string) => Promise<void>;
  move: (workspaceId: string, terminalId: string, toIndex: number) => void;
  update: (workspaceId: string, terminal: Partial<LocalTerminal> & { id: string }) => void;
  ensureOpen: (workspaceId: string, terminalId: string, cols: number, rows: number) => Promise<void>;
  write: (workspaceId: string, terminalId: string, data: string) => Promise<void>;
  resize: (workspaceId: string, terminalId: string, cols: number, rows: number) => Promise<void>;
  subscribe: (workspaceId: string, terminalId: string, onData: (data: string) => void) => () => void;
};

type WorkspaceTerminals = {
  active?: string;
  all: LocalTerminal[];
};

const MAX_TERMINAL_BUFFER_CHARS = 240_000;

export function createMultiTerminalStore(options?: {
  onDebug?: (entry: DebugEntry) => void;
}): MultiTerminalStore {
  const [ready, setReady] = createSignal(false);
  const [store, setStore] = createStore<Record<string, WorkspaceTerminals>>({});
  const listenersByKey = new Map<string, Set<(data: string) => void>>();
  const inFlightOpen = new Map<string, Promise<void>>();
  const outputBuffers = new Map<string, string>();
  const { onDebug } = options ?? {};

  let canceled = false;
  let unlisten: (() => void) | null = null;

  const bufferKey = (workspaceId: string, terminalId: string) => `${workspaceId}:${terminalId}`;

  listen<TerminalOutputEvent>("terminal-output", (event) => {
    const payload = event.payload;
    const key = bufferKey(payload.workspace_id, payload.terminal_id);
    const existing = outputBuffers.get(key) ?? "";
    const combined = existing + payload.data;
    outputBuffers.set(
      key,
      combined.length > MAX_TERMINAL_BUFFER_CHARS
        ? combined.slice(combined.length - MAX_TERMINAL_BUFFER_CHARS)
        : combined,
    );
    const listeners = listenersByKey.get(key);
    if (!listeners) return;
    for (const listener of listeners) {
      listener(payload.data);
    }
  })
    .then((handler) => {
      if (canceled) {
        try {
          handler();
        } catch {
          // ignore
        }
        return;
      }
      unlisten = handler;
      setReady(true);
    })
    .catch(() => {
      setReady(true);
    });

  onCleanup(() => {
    canceled = true;
    if (unlisten) {
      try {
        unlisten();
      } catch {
        // ignore
      }
    }
    listenersByKey.clear();
    inFlightOpen.clear();
    outputBuffers.clear();
  });

  const ensureWorkspace = (workspaceId: string) => {
    if (!store[workspaceId]) {
      setStore(workspaceId, { all: [] });
    }
  };

  const all = (workspaceId: string) => store[workspaceId]?.all ?? [];

  const active = (workspaceId: string) => store[workspaceId]?.active;

  const bufferFor = (workspaceId: string, terminalId: string) =>
    outputBuffers.get(bufferKey(workspaceId, terminalId)) ?? "";

  const clearBuffer = (workspaceId: string, terminalId: string) => {
    outputBuffers.set(bufferKey(workspaceId, terminalId), "");
  };

  const createNew = async (workspaceId: string): Promise<string> => {
    ensureWorkspace(workspaceId);
    const existing = store[workspaceId]?.all ?? [];
    const existingNumbers = new Set(existing.map((t) => t.titleNumber));

    let nextNumber = 1;
    while (existingNumbers.has(nextNumber)) {
      nextNumber++;
    }

    const terminalId = `term-${Date.now()}-${nextNumber}`;
    const terminal: LocalTerminal = {
      id: terminalId,
      title: `Terminal ${nextNumber}`,
      titleNumber: nextNumber,
      isOpen: false,
      isOpening: false,
      error: null,
    };

    setStore(workspaceId, "all", [...existing, terminal]);
    setStore(workspaceId, "active", terminalId);

    onDebug?.({
      id: `${Date.now()}-client-terminal-new-${workspaceId}`,
      timestamp: Date.now(),
      source: "client",
      label: "terminal/new",
      payload: { workspaceId, terminalId },
    });

    return terminalId;
  };

  const openTerminal = (workspaceId: string, terminalId: string) => {
    ensureWorkspace(workspaceId);
    setStore(workspaceId, "active", terminalId);
  };

  const closeTerminal = async (workspaceId: string, terminalId: string) => {
    const workspace = store[workspaceId];
    if (!workspace) return;

    const terminal = workspace.all.find((t) => t.id === terminalId);
    if (!terminal) return;

    onDebug?.({
      id: `${Date.now()}-client-terminal-close-${workspaceId}`,
      timestamp: Date.now(),
      source: "client",
      label: "terminal/close",
      payload: { workspaceId, terminalId },
    });

    try {
      if (terminal.isOpen) {
        await terminalClose(workspaceId, terminalId);
      }
    } catch (err) {
      onDebug?.({
        id: `${Date.now()}-client-terminal-close-error`,
        timestamp: Date.now(),
        source: "error",
        label: "terminal/close error",
        payload: err instanceof Error ? err.message : String(err),
      });
    }

    batch(() => {
      const index = workspace.all.findIndex((t) => t.id === terminalId);
      setStore(
        workspaceId,
        "all",
        workspace.all.filter((t) => t.id !== terminalId),
      );

      if (workspace.active === terminalId) {
        const remaining = workspace.all.filter((t) => t.id !== terminalId);
        const previous = remaining[Math.max(0, index - 1)];
        setStore(workspaceId, "active", previous?.id);
      }
    });

    const key = bufferKey(workspaceId, terminalId);
    outputBuffers.delete(key);
    listenersByKey.delete(key);
  };

  const moveTerminal = (workspaceId: string, terminalId: string, toIndex: number) => {
    ensureWorkspace(workspaceId);
    const workspace = store[workspaceId];
    if (!workspace) return;

    const fromIndex = workspace.all.findIndex((t) => t.id === terminalId);
    if (fromIndex === -1) return;

    setStore(
      workspaceId,
      "all",
      produce((all) => {
        all.splice(toIndex, 0, all.splice(fromIndex, 1)[0]);
      }),
    );
  };

  const updateTerminal = (workspaceId: string, terminal: Partial<LocalTerminal> & { id: string }) => {
    ensureWorkspace(workspaceId);
    setStore(
      workspaceId,
      "all",
      (all) => all.map((t) => (t.id === terminal.id ? { ...t, ...terminal } : t)),
    );
  };

  const ensureOpen = async (workspaceId: string, terminalId: string, cols: number, rows: number): Promise<void> => {
    ensureWorkspace(workspaceId);
    const workspace = store[workspaceId];
    const terminal = workspace?.all.find((t) => t.id === terminalId);
    if (terminal?.isOpen) return;

    const key = bufferKey(workspaceId, terminalId);
    const inFlight = inFlightOpen.get(key);
    if (inFlight) return inFlight;

    const promise = (async () => {
      updateTerminal(workspaceId, { id: terminalId, isOpening: true, error: null });

      onDebug?.({
        id: `${Date.now()}-client-terminal-open-${workspaceId}`,
        timestamp: Date.now(),
        source: "client",
        label: "terminal/open",
        payload: { workspaceId, terminalId, cols, rows },
      });

      try {
        await terminalOpen(workspaceId, terminalId, cols, rows);
        updateTerminal(workspaceId, { id: terminalId, isOpen: true, isOpening: false, rows, cols });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        updateTerminal(workspaceId, { id: terminalId, isOpen: false, isOpening: false, error: message });
        onDebug?.({
          id: `${Date.now()}-client-terminal-open-error`,
          timestamp: Date.now(),
          source: "error",
          label: "terminal/open error",
          payload: message,
        });
        throw err;
      } finally {
        inFlightOpen.delete(key);
      }
    })();

    inFlightOpen.set(key, promise);
    return promise;
  };

  const write = async (workspaceId: string, terminalId: string, data: string) => {
    const workspace = store[workspaceId];
    const terminal = workspace?.all.find((t) => t.id === terminalId);
    if (!terminal?.isOpen) return;
    await terminalWrite(workspaceId, terminalId, data);
  };

  const resize = async (workspaceId: string, terminalId: string, cols: number, rows: number) => {
    const workspace = store[workspaceId];
    const terminal = workspace?.all.find((t) => t.id === terminalId);
    if (!terminal?.isOpen) return;
    await terminalResize(workspaceId, terminalId, cols, rows);
    updateTerminal(workspaceId, { id: terminalId, cols, rows });
  };

  const subscribe = (workspaceId: string, terminalId: string, onData: (data: string) => void) => {
    const key = bufferKey(workspaceId, terminalId);
    const listeners = listenersByKey.get(key) ?? new Set<(data: string) => void>();
    listeners.add(onData);
    listenersByKey.set(key, listeners);

    return () => {
      const set = listenersByKey.get(key);
      if (!set) return;
      set.delete(onData);
      if (set.size === 0) {
        listenersByKey.delete(key);
      }
    };
  };

  return {
    ready,
    all,
    active,
    bufferFor,
    clearBuffer,
    new: createNew,
    open: openTerminal,
    close: closeTerminal,
    move: moveTerminal,
    update: updateTerminal,
    ensureOpen,
    write,
    resize,
    subscribe,
  };
}
