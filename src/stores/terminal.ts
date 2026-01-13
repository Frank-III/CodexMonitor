import { createSignal, onCleanup } from "solid-js";
import { listen } from "@tauri-apps/api/event";
import type { DebugEntry, TerminalOutputEvent } from "../types";
import { terminalClose, terminalOpen, terminalResize, terminalWrite } from "../services/tauri";

export type TerminalSessionState = {
  terminalId: string;
  isOpen: boolean;
  isOpening: boolean;
  error: string | null;
};

export type TerminalStore = {
  sessions: () => Record<string, TerminalSessionState | undefined>;
  sessionForWorkspace: (workspaceId: string) => TerminalSessionState | null;
  bufferForWorkspace: (workspaceId: string) => string;
  clearBuffer: (workspaceId: string) => void;
  ensureOpen: (workspaceId: string, cols: number, rows: number) => Promise<string>;
  close: (workspaceId: string) => Promise<void>;
  write: (workspaceId: string, data: string) => Promise<void>;
  resize: (workspaceId: string, cols: number, rows: number) => Promise<void>;
  subscribe: (workspaceId: string, onData: (data: string) => void) => () => void;
};

const DEFAULT_TERMINAL_ID = "main";
const MAX_TERMINAL_BUFFER_CHARS = 240_000;

export function createTerminalStore(options?: {
  onDebug?: (entry: DebugEntry) => void;
}): TerminalStore {
  const [sessions, setSessions] = createSignal<Record<string, TerminalSessionState>>({});
  const listenersByWorkspace = new Map<string, Set<(data: string) => void>>();
  const inFlightOpen = new Map<string, Promise<string>>();
  const outputBufferByWorkspace = new Map<string, string>();
  const { onDebug } = options ?? {};

  let canceled = false;
  let unlisten: (() => void) | null = null;

  listen<TerminalOutputEvent>("terminal-output", (event) => {
    const payload = event.payload;
    const existing = outputBufferByWorkspace.get(payload.workspace_id) ?? "";
    const combined = existing + payload.data;
    outputBufferByWorkspace.set(
      payload.workspace_id,
      combined.length > MAX_TERMINAL_BUFFER_CHARS
        ? combined.slice(combined.length - MAX_TERMINAL_BUFFER_CHARS)
        : combined,
    );
    const listeners = listenersByWorkspace.get(payload.workspace_id);
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
    })
    .catch(() => {});

  onCleanup(() => {
    canceled = true;
    if (unlisten) {
      try {
        unlisten();
      } catch {
        // ignore
      }
    }
    listenersByWorkspace.clear();
    inFlightOpen.clear();
    outputBufferByWorkspace.clear();
  });

  const sessionForWorkspace = (workspaceId: string) => sessions()[workspaceId] ?? null;
  const bufferForWorkspace = (workspaceId: string) => outputBufferByWorkspace.get(workspaceId) ?? "";
  const clearBuffer = (workspaceId: string) => {
    outputBufferByWorkspace.set(workspaceId, "");
  };

  const ensureOpen = async (workspaceId: string, cols: number, rows: number): Promise<string> => {
    const existing = sessions()[workspaceId];
    if (existing?.isOpen) {
      return existing.terminalId;
    }

    const inFlight = inFlightOpen.get(workspaceId);
    if (inFlight) {
      return inFlight;
    }

    const promise = (async () => {
      const terminalId = existing?.terminalId ?? DEFAULT_TERMINAL_ID;

      setSessions((prev) => ({
        ...prev,
        [workspaceId]: { terminalId, isOpen: false, isOpening: true, error: null },
      }));
      onDebug?.({
        id: `${Date.now()}-client-terminal-open-${workspaceId}`,
        timestamp: Date.now(),
        source: "client",
        label: "terminal/open",
        payload: { workspaceId, terminalId, cols, rows },
      });

      try {
        await terminalOpen(workspaceId, terminalId, cols, rows);
        setSessions((prev) => ({
          ...prev,
          [workspaceId]: { terminalId, isOpen: true, isOpening: false, error: null },
        }));
        return terminalId;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setSessions((prev) => ({
          ...prev,
          [workspaceId]: { terminalId, isOpen: false, isOpening: false, error: message },
        }));
        onDebug?.({
          id: `${Date.now()}-client-terminal-open-${workspaceId}-error`,
          timestamp: Date.now(),
          source: "error",
          label: "terminal/open error",
          payload: message,
        });
        throw err;
      } finally {
        inFlightOpen.delete(workspaceId);
      }
    })();

    inFlightOpen.set(workspaceId, promise);
    return promise;
  };

  const close = async (workspaceId: string) => {
    const session = sessions()[workspaceId];
    if (!session) return;
    onDebug?.({
      id: `${Date.now()}-client-terminal-close-${workspaceId}`,
      timestamp: Date.now(),
      source: "client",
      label: "terminal/close",
      payload: { workspaceId, terminalId: session.terminalId },
    });
    try {
      await terminalClose(workspaceId, session.terminalId);
    } finally {
      setSessions((prev) => {
        const next = { ...prev };
        delete next[workspaceId];
        return next;
      });
    }
  };

  const write = async (workspaceId: string, data: string) => {
    const session = sessions()[workspaceId];
    if (!session?.isOpen) return;
    await terminalWrite(workspaceId, session.terminalId, data);
  };

  const resize = async (workspaceId: string, cols: number, rows: number) => {
    const session = sessions()[workspaceId];
    if (!session?.isOpen) return;
    await terminalResize(workspaceId, session.terminalId, cols, rows);
  };

  const subscribe = (workspaceId: string, onData: (data: string) => void) => {
    const listeners = listenersByWorkspace.get(workspaceId) ?? new Set<(data: string) => void>();
    listeners.add(onData);
    listenersByWorkspace.set(workspaceId, listeners);

    return () => {
      const set = listenersByWorkspace.get(workspaceId);
      if (!set) return;
      set.delete(onData);
      if (set.size === 0) {
        listenersByWorkspace.delete(workspaceId);
      }
    };
  };

  return {
    sessions,
    sessionForWorkspace,
    bufferForWorkspace,
    clearBuffer,
    ensureOpen,
    close,
    write,
    resize,
    subscribe,
  };
}
