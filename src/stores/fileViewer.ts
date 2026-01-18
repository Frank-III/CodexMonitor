import { createEffect, on, type Accessor } from "solid-js";
import { createStore } from "solid-js/store";
import type { WorkspaceFileContent, WorkspaceInfo } from "../types";
import { listWorkspaceFiles, readWorkspaceFileText } from "../services/tauri";

type WorkspaceFileSummary = { path: string; name: string };

type FileViewerState = {
  workspaceId: string | null;
  query: string;
  files: WorkspaceFileSummary[];
  isLoadingFiles: boolean;
  filesError: string | null;
  selectedPath: string | null;
  file: WorkspaceFileContent | null;
  isLoadingFile: boolean;
  fileError: string | null;
};

const emptyState: FileViewerState = {
  workspaceId: null,
  query: "",
  files: [],
  isLoadingFiles: false,
  filesError: null,
  selectedPath: null,
  file: null,
  isLoadingFile: false,
  fileError: null,
};

const DEFAULT_LIST_LIMIT = 250;
const DEFAULT_MAX_BYTES = 1024 * 1024;

export type FileViewerStore = {
  state: () => FileViewerState;
  setQuery: (value: string) => void;
  selectFile: (path: string) => void;
  refreshFiles: () => Promise<void>;
  refreshFile: () => Promise<void>;
};

export function createFileViewerStore(options: {
  activeWorkspace: Accessor<WorkspaceInfo | null>;
  enabled: Accessor<boolean>;
}): FileViewerStore {
  const [state, setState] = createStore<FileViewerState>(emptyState);

  let listRequestId = 0;
  let fileRequestId = 0;

  const resetForWorkspace = (workspaceId: string | null) => {
    setState({
      ...emptyState,
      workspaceId,
    });
  };

  const loadFiles = async (query: string) => {
    const workspace = options.activeWorkspace();
    if (!options.enabled() || !workspace) {
      return;
    }

    const requestId = ++listRequestId;
    setState({ isLoadingFiles: true, filesError: null });
    try {
      const files = await listWorkspaceFiles(
        workspace.id,
        query.trim() ? query : undefined,
        DEFAULT_LIST_LIMIT,
      );
      if (requestId !== listRequestId) {
        return;
      }
      setState({
        files,
        isLoadingFiles: false,
        filesError: null,
      });
    } catch (err) {
      if (requestId !== listRequestId) {
        return;
      }
      setState({
        files: [],
        isLoadingFiles: false,
        filesError: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const loadFile = async (path: string) => {
    const workspace = options.activeWorkspace();
    if (!options.enabled() || !workspace) {
      return;
    }

    const requestId = ++fileRequestId;
    setState({ isLoadingFile: true, fileError: null });
    try {
      const file = await readWorkspaceFileText(workspace.id, path, DEFAULT_MAX_BYTES);
      if (requestId !== fileRequestId) {
        return;
      }
      setState({ file, isLoadingFile: false, fileError: null });
    } catch (err) {
      if (requestId !== fileRequestId) {
        return;
      }
      setState({
        file: null,
        isLoadingFile: false,
        fileError: err instanceof Error ? err.message : String(err),
      });
    }
  };

  createEffect(
    on(
      () => options.activeWorkspace()?.id ?? null,
      (workspaceId) => {
        resetForWorkspace(workspaceId);
        listRequestId++;
        fileRequestId++;
        if (workspaceId && options.enabled()) {
          void loadFiles("");
        }
      },
    ),
  );

  createEffect(
    on(
      () => options.enabled(),
      (enabled) => {
        if (!enabled) {
          return;
        }
        const workspace = options.activeWorkspace();
        if (!workspace) {
          return;
        }
        if (!state.isLoadingFiles && state.files.length === 0) {
          void loadFiles(state.query);
        }
        if (state.selectedPath && !state.isLoadingFile && !state.file) {
          void loadFile(state.selectedPath);
        }
      },
    ),
  );

  createEffect(
    on(
      () => [options.enabled(), state.workspaceId, state.query] as const,
      ([enabled, workspaceId, query]) => {
        if (!enabled || !workspaceId) {
          return;
        }

        const handle = window.setTimeout(() => {
          void loadFiles(query);
        }, 150);

        return () => {
          window.clearTimeout(handle);
        };
      },
    ),
  );

  return {
    state: () => state,
    setQuery: (value) => {
      setState({ query: value });
    },
    selectFile: (path) => {
      setState({ selectedPath: path, file: null, fileError: null });
      void loadFile(path);
    },
    refreshFiles: async () => {
      await loadFiles(state.query);
    },
    refreshFile: async () => {
      if (!state.selectedPath) {
        return;
      }
      await loadFile(state.selectedPath);
    },
  };
}

