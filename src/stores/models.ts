import { createSignal, createMemo, createEffect } from "solid-js";
import type { DebugEntry, ModelOption, WorkspaceInfo } from "../types";
import { getModelList } from "../services/tauri";

export type ModelsStore = {
  models: () => ModelOption[];
  selectedModel: () => ModelOption | null;
  selectedModelId: () => string | null;
  setSelectedModelId: (id: string | null) => void;
  reasoningOptions: () => string[];
  selectedEffort: () => string | null;
  setSelectedEffort: (effort: string | null) => void;
  refreshModels: () => Promise<void>;
};

export function createModelsStore(options: {
  activeWorkspace: () => WorkspaceInfo | null;
  onDebug?: (entry: DebugEntry) => void;
}): ModelsStore {
  const [models, setModels] = createSignal<ModelOption[]>([]);
  const [selectedModelId, setSelectedModelId] = createSignal<string | null>(null);
  const [selectedEffort, setSelectedEffort] = createSignal<string | null>(null);
  let lastFetchedWorkspaceId: string | null = null;
  let inFlight = false;

  const { activeWorkspace, onDebug } = options;

  const selectedModel = createMemo(
    () => models().find((model) => model.id === selectedModelId()) ?? null
  );

  const reasoningOptions = createMemo(() => {
    const model = selectedModel();
    if (!model) {
      return [];
    }
    return model.supportedReasoningEfforts.map((effort) => effort.reasoningEffort);
  });

  async function refreshModels(): Promise<void> {
    const workspace = activeWorkspace();
    const workspaceId = workspace?.id ?? null;
    const isConnected = Boolean(workspace?.connected);

    if (!workspaceId || !isConnected) {
      return;
    }
    if (inFlight) {
      return;
    }
    inFlight = true;
    onDebug?.({
      id: `${Date.now()}-client-model-list`,
      timestamp: Date.now(),
      source: "client",
      label: "model/list",
      payload: { workspaceId },
    });
    try {
      const response = await getModelList(workspaceId);
      onDebug?.({
        id: `${Date.now()}-server-model-list`,
        timestamp: Date.now(),
        source: "server",
        label: "model/list response",
        payload: response,
      });
      const rawData = response.result?.data ?? response.data ?? [];
      const data: ModelOption[] = rawData.map((item: any) => ({
        id: String(item.id ?? item.model ?? ""),
        model: String(item.model ?? item.id ?? ""),
        displayName: String(item.displayName ?? item.display_name ?? item.model ?? ""),
        description: String(item.description ?? ""),
        supportedReasoningEfforts: Array.isArray(item.supportedReasoningEfforts)
          ? item.supportedReasoningEfforts
          : Array.isArray(item.supported_reasoning_efforts)
            ? item.supported_reasoning_efforts.map((effort: any) => ({
                reasoningEffort: String(
                  effort.reasoningEffort ?? effort.reasoning_effort ?? ""
                ),
                description: String(effort.description ?? ""),
              }))
            : [],
        defaultReasoningEffort: String(
          item.defaultReasoningEffort ?? item.default_reasoning_effort ?? ""
        ),
        isDefault: Boolean(item.isDefault ?? item.is_default ?? false),
      }));
      setModels(data);
      lastFetchedWorkspaceId = workspaceId;
      const preferredModel =
        data.find((model) => model.model === "gpt-5.2-codex") ?? null;
      const defaultModel =
        preferredModel ?? data.find((model) => model.isDefault) ?? data[0] ?? null;
      if (defaultModel) {
        setSelectedModelId(defaultModel.id);
        setSelectedEffort(defaultModel.defaultReasoningEffort ?? null);
      }
    } catch (error) {
      onDebug?.({
        id: `${Date.now()}-client-model-list-error`,
        timestamp: Date.now(),
        source: "error",
        label: "model/list error",
        payload: error instanceof Error ? error.message : String(error),
      });
    } finally {
      inFlight = false;
    }
  }

  // Auto-refresh when workspace changes
  createEffect(() => {
    const workspace = activeWorkspace();
    const workspaceId = workspace?.id ?? null;
    const isConnected = Boolean(workspace?.connected);

    if (!workspaceId || !isConnected) {
      return;
    }
    if (lastFetchedWorkspaceId === workspaceId && models().length > 0) {
      return;
    }
    refreshModels();
  });

  // Reset effort when model changes
  createEffect(() => {
    const model = selectedModel();
    if (!model) {
      return;
    }
    const effort = selectedEffort();
    if (
      effort &&
      model.supportedReasoningEfforts.some((e) => e.reasoningEffort === effort)
    ) {
      return;
    }
    setSelectedEffort(model.defaultReasoningEffort ?? null);
  });

  return {
    models,
    selectedModel,
    selectedModelId,
    setSelectedModelId,
    reasoningOptions,
    selectedEffort,
    setSelectedEffort,
    refreshModels,
  };
}
