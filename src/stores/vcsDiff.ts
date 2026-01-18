import { createMemo, createResource, type Accessor } from "solid-js";
import { getFileDiff, type FileDiffResult } from "../services/tauri";

type FileDiffKey = {
  workspaceId: string;
  filePath: string;
};

export function createVcsFileDiffResource(options: {
  workspaceId: Accessor<string | null | undefined>;
  filePath: Accessor<string | null | undefined>;
}) {
  const key = createMemo<FileDiffKey | null>(() => {
    const workspaceId = options.workspaceId();
    const filePath = options.filePath();
    if (!workspaceId || !filePath) {
      return null;
    }
    return { workspaceId, filePath };
  });

  const [diff] = createResource(
    key,
    async ({ workspaceId, filePath }: FileDiffKey): Promise<FileDiffResult> =>
      getFileDiff(workspaceId, filePath),
  );

  return diff;
}

