import { onCleanup } from "solid-js";
import { createStore } from "solid-js/store";
import { listen } from "@tauri-apps/api/event";
import type { DebugEntry, WorkspaceTaskEvent, WorkspaceTaskStream } from "../types";
import { runWorkspaceRun, runWorkspaceSetup, runWorkspaceSpotlight } from "../services/tauri";

export type WorkspaceTaskOutputLine = {
  stream: WorkspaceTaskStream;
  data: string;
};

export type WorkspaceTaskRun = {
  op_id: string;
  task: string;
  command: string;
  cwd: string;
  root_path: string | null;
  running: boolean;
  ok: boolean | null;
  exit_code: number | null;
  error: string | null;
  started_at: number;
  finished_at: number | null;
  output: WorkspaceTaskOutputLine[];
};

export type WorkspaceTasksState = {
  runsByWorkspaceId: Record<
    string,
    Record<string, WorkspaceTaskRun | undefined> | undefined
  >;
};

export type WorkspaceTasksStore = {
  state: () => WorkspaceTasksState;
  runsForWorkspace: (workspaceId: string) => Record<string, WorkspaceTaskRun | undefined>;
  runForWorkspaceTask: (workspaceId: string, task: string) => WorkspaceTaskRun | null;
  latestRunForWorkspace: (workspaceId: string) => WorkspaceTaskRun | null;
  runSetup: (workspaceId: string) => Promise<string>;
  runRun: (workspaceId: string) => Promise<string>;
  runSpotlight: (workspaceId: string) => Promise<string>;
  clearTask: (workspaceId: string, task: string) => void;
  clearWorkspace: (workspaceId: string) => void;
};

const MAX_OUTPUT_LINES = 600;

export function createWorkspaceTasksStore(options?: {
  onDebug?: (entry: DebugEntry) => void;
}): WorkspaceTasksStore {
  const [state, setState] = createStore<WorkspaceTasksState>({
    runsByWorkspaceId: {},
  });

  const { onDebug } = options ?? {};

  let canceled = false;
  let unlisten: (() => void) | null = null;

  listen<WorkspaceTaskEvent>("workspace-task-event", (event) => {
    const payload = event.payload;
    const workspaceId = payload.workspace_id;
    const task = payload.task;

    switch (payload.stage) {
      case "start": {
        setState("runsByWorkspaceId", workspaceId, (prev) => ({
          ...(prev ?? {}),
          [task]: {
            op_id: payload.op_id,
            task: payload.task,
            command: payload.command,
            cwd: payload.cwd,
            root_path: payload.root_path,
            running: true,
            ok: null,
            exit_code: null,
            error: null,
            started_at: Date.now(),
            finished_at: null,
            output: [],
          },
        }));
        onDebug?.({
          id: `${Date.now()}-event-workspace-task-${payload.op_id}-start`,
          timestamp: Date.now(),
          source: "event",
          label: `workspace-task/${payload.task} start`,
          payload,
        });
        return;
      }
      case "output": {
        setState("runsByWorkspaceId", workspaceId, task, (prev) => {
          if (!prev || prev.op_id !== payload.op_id) {
            return prev;
          }
          const nextOutput = [...prev.output, { stream: payload.stream, data: payload.data }];
          const clipped =
            nextOutput.length > MAX_OUTPUT_LINES
              ? nextOutput.slice(nextOutput.length - MAX_OUTPUT_LINES)
              : nextOutput;
          return { ...prev, output: clipped };
        });
        return;
      }
      case "end": {
        setState("runsByWorkspaceId", workspaceId, task, (prev) => {
          if (!prev || prev.op_id !== payload.op_id) {
            return prev;
          }
          return {
            ...prev,
            running: false,
            ok: payload.ok,
            exit_code: payload.exit_code,
            error: payload.error,
            finished_at: Date.now(),
          };
        });
        onDebug?.({
          id: `${Date.now()}-event-workspace-task-${payload.op_id}-end`,
          timestamp: Date.now(),
          source: payload.ok ? "event" : "error",
          label: `workspace-task/${payload.task} end`,
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

  const runsForWorkspace = (workspaceId: string) => state.runsByWorkspaceId[workspaceId] ?? {};

  const runForWorkspaceTask = (workspaceId: string, task: string) =>
    runsForWorkspace(workspaceId)[task] ?? null;

  const latestRunForWorkspace = (workspaceId: string) => {
    const runs = Object.values(runsForWorkspace(workspaceId)).filter(Boolean) as WorkspaceTaskRun[];
    if (runs.length === 0) return null;
    runs.sort((a, b) => b.started_at - a.started_at);
    return runs[0] ?? null;
  };

  const runSetup = async (workspaceId: string) => {
    onDebug?.({
      id: `${Date.now()}-client-workspace-setup-${workspaceId}`,
      timestamp: Date.now(),
      source: "client",
      label: "workspace/setup",
      payload: { workspaceId },
    });
    return runWorkspaceSetup(workspaceId);
  };

  const runRun = async (workspaceId: string) => {
    onDebug?.({
      id: `${Date.now()}-client-workspace-run-${workspaceId}`,
      timestamp: Date.now(),
      source: "client",
      label: "workspace/run",
      payload: { workspaceId },
    });
    return runWorkspaceRun(workspaceId);
  };

  const runSpotlight = async (workspaceId: string) => {
    onDebug?.({
      id: `${Date.now()}-client-workspace-spotlight-${workspaceId}`,
      timestamp: Date.now(),
      source: "client",
      label: "workspace/spotlight",
      payload: { workspaceId },
    });
    return runWorkspaceSpotlight(workspaceId);
  };

  const clearTask = (workspaceId: string, task: string) => {
    setState("runsByWorkspaceId", workspaceId, task, undefined);
  };

  const clearWorkspace = (workspaceId: string) => setState("runsByWorkspaceId", workspaceId, {});

  return {
    state: () => state,
    runsForWorkspace,
    runForWorkspaceTask,
    latestRunForWorkspace,
    runSetup,
    runRun,
    runSpotlight,
    clearTask,
    clearWorkspace,
  };
}
