import { createSignal, createMemo, createEffect, on } from "solid-js";
import type { DebugEntry, SkillOption, WorkspaceInfo } from "../types";
import { getSkillsList } from "../services/tauri";

export type SkillsStore = {
  skills: () => SkillOption[];
  refreshSkills: () => Promise<void>;
};

export function createSkillsStore(options: {
  activeWorkspace: () => WorkspaceInfo | null;
  onDebug?: (entry: DebugEntry) => void;
}): SkillsStore {
  const [skills, setSkills] = createSignal<SkillOption[]>([]);
  let lastFetchedWorkspaceId: string | null = null;
  let inFlight = false;

  const { activeWorkspace, onDebug } = options;

  async function refreshSkills(): Promise<void> {
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
      id: `${Date.now()}-client-skills-list`,
      timestamp: Date.now(),
      source: "client",
      label: "skills/list",
      payload: { workspaceId },
    });
    try {
      const response = await getSkillsList(workspaceId);
      onDebug?.({
        id: `${Date.now()}-server-skills-list`,
        timestamp: Date.now(),
        source: "server",
        label: "skills/list response",
        payload: response,
      });
      const dataBuckets = response.result?.data ?? response.data ?? [];
      const rawSkills =
        response.result?.skills ??
        response.skills ??
        (Array.isArray(dataBuckets)
          ? dataBuckets.flatMap((bucket: any) => bucket?.skills ?? [])
          : []);
      const data: SkillOption[] = rawSkills.map((item: any) => ({
        name: String(item.name ?? ""),
        path: String(item.path ?? ""),
        description: item.description ? String(item.description) : undefined,
      }));
      setSkills(data);
      lastFetchedWorkspaceId = workspaceId;
    } catch (error) {
      onDebug?.({
        id: `${Date.now()}-client-skills-list-error`,
        timestamp: Date.now(),
        source: "error",
        label: "skills/list error",
        payload: error instanceof Error ? error.message : String(error),
      });
    } finally {
      inFlight = false;
    }
  }

  createEffect(
    on(
      () => [activeWorkspace()?.id, activeWorkspace()?.connected] as const,
      ([workspaceId, connected]) => {
        if (!workspaceId || !connected) {
          return;
        }
        if (lastFetchedWorkspaceId === workspaceId && skills().length > 0) {
          return;
        }
        refreshSkills();
      }
    )
  );

  const skillOptions = createMemo(() => skills().filter((skill) => skill.name));

  return {
    skills: skillOptions,
    refreshSkills,
  };
}
