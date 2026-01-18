import { onCleanup } from "solid-js";
import { createStore } from "solid-js/store";
import { listen } from "@tauri-apps/api/event";
import type {
  DebugEntry,
  WorktreeStackAction,
  WorktreeStackEvent,
  WorktreeStackTarget,
} from "../types";

export type WorktreeStackStepStatus = "pending" | "running" | "success" | "error";

export type WorktreeStackStepState = {
  workspace_id: string;
  name: string;
  index: number;
  total: number;
  status: WorktreeStackStepStatus;
  message: string | null;
  destination_id: string | null;
};

export type WorktreeStackOpState = {
  op_id: string;
  action: WorktreeStackAction;
  root_id: string;
  targets: WorktreeStackTarget[];
  total: number;
  completed: number;
  running: boolean;
  ok: boolean | null;
  error: string | null;
  started_at: number;
  finished_at: number | null;
  steps_by_workspace_id: Record<string, WorktreeStackStepState | undefined>;
};

export type WorktreeStackOpsState = {
  active: WorktreeStackOpState | null;
};

export type WorktreeStackOpsStore = {
  state: () => WorktreeStackOpsState;
  clear: () => void;
};

export function createWorktreeStackOpsStore(options?: {
  onDebug?: (entry: DebugEntry) => void;
}): WorktreeStackOpsStore {
  const [state, setState] = createStore<WorktreeStackOpsState>({
    active: null,
  });

  const { onDebug } = options ?? {};

  let canceled = false;
  let unlisten: (() => void) | null = null;

  const clear = () => {
    setState("active", null);
  };

  listen<WorktreeStackEvent>("worktree-stack-event", (event) => {
    const payload = event.payload;
    if (payload.stage === "start") {
      const total = payload.targets.length;
      const steps_by_workspace_id: Record<string, WorktreeStackStepState | undefined> = {};
      for (const [idx, target] of payload.targets.entries()) {
        steps_by_workspace_id[target.workspace_id] = {
          workspace_id: target.workspace_id,
          name: target.name,
          index: idx + 1,
          total,
          status: "pending",
          message: null,
          destination_id: null,
        };
      }

      setState("active", {
        op_id: payload.op_id,
        action: payload.action,
        root_id: payload.root_id,
        targets: payload.targets,
        total,
        completed: 0,
        running: true,
        ok: null,
        error: null,
        started_at: Date.now(),
        finished_at: null,
        steps_by_workspace_id,
      });
      onDebug?.({
        id: `${Date.now()}-event-worktree-stack-${payload.op_id}-start`,
        timestamp: Date.now(),
        source: "event",
        label: `worktree-stack/${payload.action} start`,
        payload,
      });
      return;
    }

    const active = state.active;
    if (!active || active.op_id !== payload.op_id) {
      return;
    }

    switch (payload.stage) {
      case "step_start": {
        setState("active", "steps_by_workspace_id", payload.workspace_id, (prev) => ({
          ...(prev ?? {
            workspace_id: payload.workspace_id,
            name: payload.name,
            index: payload.index,
            total: payload.total,
            status: "pending" as const,
            message: null,
            destination_id: null,
          }),
          status: "running" as const,
          message: null,
          destination_id: null,
        }));
        return;
      }
      case "step_end": {
        setState("active", "completed", (value) => Math.max(value, payload.index));
        setState("active", "steps_by_workspace_id", payload.workspace_id, (prev) => ({
          ...(prev ?? {
            workspace_id: payload.workspace_id,
            name: payload.name,
            index: payload.index,
            total: payload.total,
            status: "pending" as const,
            message: null,
            destination_id: null,
          }),
          status: (payload.ok ? "success" : "error") as WorktreeStackStepStatus,
          message: payload.message,
          destination_id: payload.destination_id,
        }));
        return;
      }
      case "end": {
        setState("active", {
          ...active,
          running: false,
          ok: payload.ok,
          error: payload.error,
          finished_at: Date.now(),
        });
        onDebug?.({
          id: `${Date.now()}-event-worktree-stack-${payload.op_id}-end`,
          timestamp: Date.now(),
          source: "event",
          label: `worktree-stack/${payload.action} end`,
          payload,
        });
        return;
      }
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
  });

  return {
    state: () => state,
    clear,
  };
}
