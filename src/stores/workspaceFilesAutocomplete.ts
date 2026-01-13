import { createSignal, createEffect, on, type Accessor } from "solid-js";
import { listWorkspacePaths } from "../services/tauri";
import type { AutocompleteItem } from "./composerAutocomplete";

type WorkspaceFilesAutocompleteOptions = {
  workspaceId: Accessor<string | null | undefined>;
};

export function createWorkspaceFilesAutocomplete(
  options: WorkspaceFilesAutocompleteOptions,
): {
  items: Accessor<AutocompleteItem[]>;
  onQueryChange: (query: string) => void;
} {
  const [items, setItems] = createSignal<AutocompleteItem[]>([]);
  let requestId = 0;
  let lastWorkspaceId: string | null | undefined;

  async function load(query: string) {
    const workspaceId = options.workspaceId();
    if (!workspaceId) {
      setItems([]);
      return;
    }

    const currentRequestId = ++requestId;
    lastWorkspaceId = workspaceId;
    const trimmed = query.trim();

    try {
      const paths = await listWorkspacePaths(
        workspaceId,
        trimmed ? trimmed : undefined,
      );

      if (requestId !== currentRequestId || lastWorkspaceId !== workspaceId) {
        return;
      }

      setItems(
        paths.map((entry) => ({
          id: entry.path,
          label: entry.kind === "dir" ? `${entry.name}/` : entry.name,
          description: entry.kind === "dir" ? `${entry.path}/` : entry.path,
          insertText: entry.kind === "dir" ? `${entry.path}/` : entry.path,
          kind: entry.kind,
        })),
      );
    } catch {
      if (requestId !== currentRequestId || lastWorkspaceId !== workspaceId) {
        return;
      }
      setItems([]);
    }
  }

  createEffect(
    on(options.workspaceId, (workspaceId) => {
      if (workspaceId !== lastWorkspaceId) {
        lastWorkspaceId = workspaceId;
        requestId++;
        setItems([]);
      }
    }),
  );

  return {
    items,
    onQueryChange: (query) => {
      void load(query);
    },
  };
}
