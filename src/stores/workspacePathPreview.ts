import { createEffect, on, type Accessor } from "solid-js";
import { createStore } from "solid-js/store";
import type { WorkspaceDirTree, WorkspaceFileContent, WorkspaceInfo } from "../types";
import { listWorkspaceDir, readWorkspaceFileText } from "../services/tauri";

type PreviewStatus = "idle" | "loading" | "ready" | "error";

type PreviewEntry<T> = {
  status: PreviewStatus;
  data: T | null;
  error: string | null;
};

type PathPreviewState = {
  workspaceId: string | null;
  dirs: Record<string, PreviewEntry<WorkspaceDirTree>>;
  files: Record<string, PreviewEntry<WorkspaceFileContent>>;
};

const emptyState: PathPreviewState = {
  workspaceId: null,
  dirs: {},
  files: {},
};

const DEFAULT_DIR_DEPTH = 2;
const DEFAULT_DIR_LIMIT = 160;
const DEFAULT_FILE_MAX_BYTES = 48 * 1024;

export type WorkspacePathPreviewStore = {
  state: () => PathPreviewState;
  ensureDir: (path: string) => void;
  ensureFile: (path: string) => void;
  reset: () => void;
};

function normalizeRelativePath(raw: string) {
  return raw.trim().replace(/^\/+/, "").replace(/\/+$/, "");
}

export function createWorkspacePathPreviewStore(options: {
  activeWorkspace: Accessor<WorkspaceInfo | null>;
}): WorkspacePathPreviewStore {
  const [state, setState] = createStore<PathPreviewState>(emptyState);

  let generation = 0;
  const dirRequestIds: Record<string, number> = {};
  const fileRequestIds: Record<string, number> = {};

  const reset = () => {
    generation += 1;
    for (const key of Object.keys(dirRequestIds)) delete dirRequestIds[key];
    for (const key of Object.keys(fileRequestIds)) delete fileRequestIds[key];
    setState({ ...emptyState, workspaceId: options.activeWorkspace()?.id ?? null });
  };

  createEffect(
    on(
      () => options.activeWorkspace()?.id ?? null,
      () => {
        reset();
      },
    ),
  );

  const ensureDir = (rawPath: string) => {
    const workspaceId = state.workspaceId;
    if (!workspaceId) {
      return;
    }

    const path = normalizeRelativePath(rawPath);
    const existing = state.dirs[path];
    if (existing?.status === "loading" || existing?.status === "ready") {
      return;
    }

    setState("dirs", path, { status: "loading", data: null, error: null });

    const requestGeneration = generation;
    const requestId = (dirRequestIds[path] ?? 0) + 1;
    dirRequestIds[path] = requestId;

    void listWorkspaceDir(workspaceId, path, DEFAULT_DIR_DEPTH, DEFAULT_DIR_LIMIT)
      .then((data) => {
        if (generation !== requestGeneration) return;
        if (dirRequestIds[path] !== requestId) return;
        setState("dirs", path, { status: "ready", data, error: null });
      })
      .catch((err) => {
        if (generation !== requestGeneration) return;
        if (dirRequestIds[path] !== requestId) return;
        setState("dirs", path, {
          status: "error",
          data: null,
          error: err instanceof Error ? err.message : String(err),
        });
      });
  };

  const ensureFile = (rawPath: string) => {
    const workspaceId = state.workspaceId;
    if (!workspaceId) {
      return;
    }

    const path = normalizeRelativePath(rawPath);
    const existing = state.files[path];
    if (existing?.status === "loading" || existing?.status === "ready") {
      return;
    }

    setState("files", path, { status: "loading", data: null, error: null });

    const requestGeneration = generation;
    const requestId = (fileRequestIds[path] ?? 0) + 1;
    fileRequestIds[path] = requestId;

    void readWorkspaceFileText(workspaceId, path, DEFAULT_FILE_MAX_BYTES)
      .then((data) => {
        if (generation !== requestGeneration) return;
        if (fileRequestIds[path] !== requestId) return;
        setState("files", path, { status: "ready", data, error: null });
      })
      .catch((err) => {
        if (generation !== requestGeneration) return;
        if (fileRequestIds[path] !== requestId) return;
        setState("files", path, {
          status: "error",
          data: null,
          error: err instanceof Error ? err.message : String(err),
        });
      });
  };

  return {
    state: () => state,
    ensureDir,
    ensureFile,
    reset,
  };
}

