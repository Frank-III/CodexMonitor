import { createEffect, createMemo, createSignal, on } from "solid-js";
import type { DebugEntry, PromptOption, WorkspaceInfo } from "../types";
import { getPromptsList } from "../services/tauri";

export type PromptsStore = {
  prompts: () => PromptOption[];
  isLoading: () => boolean;
  error: () => string | null;
  refreshPrompts: (options?: { force?: boolean }) => Promise<void>;
  clearError: () => void;
};

function normalizePrompt(raw: any): PromptOption | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const name = String(raw.name ?? raw.title ?? raw.id ?? "").trim();
  if (!name) {
    return null;
  }

  const id = String(raw.id ?? raw.name ?? name).trim();
  const description = raw.description ? String(raw.description) : undefined;
  const prompt = raw.prompt ?? raw.content ?? raw.text ?? raw.body;

  return {
    id,
    name,
    description: description?.trim() ? description.trim() : undefined,
    prompt: typeof prompt === "string" && prompt.trim() ? prompt : undefined,
  };
}

function extractPromptList(payload: any): any[] {
  const raw =
    payload?.result?.prompts ??
    payload?.prompts ??
    payload?.result?.data ??
    payload?.data ??
    [];

  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.flatMap((entry) => {
    if (entry && typeof entry === "object" && Array.isArray((entry as any).prompts)) {
      return (entry as any).prompts;
    }
    return [entry];
  });
}

export function createPromptsStore(options: {
  activeWorkspace: () => WorkspaceInfo | null;
  enabled: () => boolean;
  onDebug?: (entry: DebugEntry) => void;
}): PromptsStore {
  const { activeWorkspace, enabled, onDebug } = options;

  const [promptsByWorkspaceId, setPromptsByWorkspaceId] = createSignal<
    Record<string, PromptOption[]>
  >({});
  const [loadingByWorkspaceId, setLoadingByWorkspaceId] = createSignal<
    Record<string, boolean>
  >({});
  const [errorByWorkspaceId, setErrorByWorkspaceId] = createSignal<
    Record<string, string | null>
  >({});

  const inFlight = new Set<string>();
  const fetched = new Set<string>();

  const workspaceId = createMemo(() => activeWorkspace()?.id ?? null);

  const prompts = createMemo(() => {
    const id = workspaceId();
    if (!id) return [];
    return promptsByWorkspaceId()[id] ?? [];
  });

  const isLoading = createMemo(() => {
    const id = workspaceId();
    if (!id) return false;
    return Boolean(loadingByWorkspaceId()[id]);
  });

  const error = createMemo(() => {
    const id = workspaceId();
    if (!id) return null;
    return errorByWorkspaceId()[id] ?? null;
  });

  async function refreshPrompts(options?: { force?: boolean }): Promise<void> {
    const force = options?.force ?? false;
    const workspace = activeWorkspace();
    const id = workspace?.id ?? null;

    if (!id) {
      return;
    }
    if (!force && fetched.has(id)) {
      return;
    }
    if (inFlight.has(id)) {
      return;
    }

    inFlight.add(id);
    setLoadingByWorkspaceId((prev) => ({ ...prev, [id]: true }));
    setErrorByWorkspaceId((prev) => ({ ...prev, [id]: null }));

    onDebug?.({
      id: `${Date.now()}-client-prompts-list`,
      timestamp: Date.now(),
      source: "client",
      label: "prompts/list",
      payload: { workspaceId: id },
    });

    try {
      const response = await getPromptsList(id);
      onDebug?.({
        id: `${Date.now()}-server-prompts-list`,
        timestamp: Date.now(),
        source: "server",
        label: "prompts/list response",
        payload: response,
      });

      const list = extractPromptList(response);
      const normalized = list
        .map(normalizePrompt)
        .filter((item): item is PromptOption => item !== null)
        .sort((a, b) => a.name.localeCompare(b.name));

      setPromptsByWorkspaceId((prev) => ({ ...prev, [id]: normalized }));
      fetched.add(id);
    } catch (err) {
      setErrorByWorkspaceId((prev) => ({
        ...prev,
        [id]: err instanceof Error ? err.message : String(err),
      }));
    } finally {
      inFlight.delete(id);
      setLoadingByWorkspaceId((prev) => ({ ...prev, [id]: false }));
    }
  }

  function clearError() {
    const id = workspaceId();
    if (!id) return;
    setErrorByWorkspaceId((prev) => ({ ...prev, [id]: null }));
  }

  createEffect(
    on(
      () => [enabled(), activeWorkspace()?.id] as const,
      ([isEnabled, id]) => {
        if (!isEnabled || !id) {
          return;
        }
        void refreshPrompts().catch(() => {});
      },
    ),
  );

  return {
    prompts,
    isLoading,
    error,
    refreshPrompts,
    clearError,
  };
}
