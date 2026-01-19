import { makePersisted } from "@solid-primitives/storage";
import { createMemo, createSignal, Show } from "solid-js";
import type { FileContents } from "@pierre/diffs";
import { SessionReview, Button } from "../ui";
import { DiffViewer } from "./DiffViewer";
import { createVcsFileDiffResource } from "../stores/vcsDiff";

type VcsFile = {
  path: string;
  status: string;
  additions: number;
  deletions: number;
};

export type WorkspaceReviewPanelProps = {
  workspaceId: string;
  files: VcsFile[];
  error: string | null | undefined;
  onRecoverStale?: () => Promise<void>;
  onOpenFile?: (path: string) => void;
};

function getLangFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const extMap: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    rs: "rust",
    py: "python",
    go: "go",
    css: "css",
    html: "html",
    json: "json",
    md: "markdown",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
  };
  return extMap[ext] ?? "text";
}

function ReviewDiff(props: {
  workspaceId: string;
  filePath: string;
  diffStyle: () => "unified" | "split";
}) {
  const diffResult = createVcsFileDiffResource({
    workspaceId: () => props.workspaceId,
    filePath: () => props.filePath,
  });

  const oldFile = createMemo((): FileContents | undefined => {
    const result = diffResult();
    if (!result) return undefined;
    return {
      name: props.filePath,
      contents: result.old_content,
      lang: getLangFromPath(props.filePath) as any,
    };
  });

  const newFile = createMemo((): FileContents | undefined => {
    const result = diffResult();
    if (!result) return undefined;
    return {
      name: props.filePath,
      contents: result.new_content,
      lang: getLangFromPath(props.filePath) as any,
    };
  });

  return (
    <div class="review-diff">
      <Show when={diffResult.loading}>
        <div class="review-diff-loading">Loading diff…</div>
      </Show>
      <Show when={!diffResult.loading && diffResult()}>
        <DiffViewer
          oldFile={oldFile()}
          newFile={newFile()}
          diffStyle={props.diffStyle()}
        />
      </Show>
      <Show when={diffResult.error}>
        <div class="review-diff-error">{String(diffResult.error)}</div>
      </Show>
    </div>
  );
}

export function WorkspaceReviewPanel(props: WorkspaceReviewPanelProps) {
  const [diffStyle, setDiffStyle] = makePersisted(
    createSignal<"unified" | "split">("unified"),
    { name: "codexmonitor.diffStyle" },
  );
  const [recovering, setRecovering] = createSignal(false);

  const isStaleError = createMemo(() => {
    const message = props.error;
    return typeof message === "string" && message.includes("update-stale");
  });

  const handleRecoverStale = async () => {
    if (!props.onRecoverStale || recovering() || !isStaleError()) {
      return;
    }
    setRecovering(true);
    try {
      await props.onRecoverStale();
    } finally {
      setRecovering(false);
    }
  };

  const diffs = createMemo(() =>
    props.files.map((file) => ({
      file: file.path,
      additions: file.additions,
      deletions: file.deletions,
    })),
  );

  return (
    <div class="workspace-review-panel">
      <Show when={props.error}>
        {(message) => (
          <div class="review-error">
            <div class="review-error-message">{message()}</div>
            <Show when={props.onRecoverStale && isStaleError()}>
              <Button
                type="button"
                variant="secondary"
                size="small"
                class="review-error-action"
                onClick={() => void handleRecoverStale()}
                disabled={recovering()}
              >
                {recovering() ? "Updating…" : "Update stale working copy"}
              </Button>
            </Show>
          </div>
        )}
      </Show>

      <Show when={!props.error && props.files.length === 0}>
        <div class="review-empty">No changes detected.</div>
      </Show>

      <Show when={!props.error && props.files.length > 0}>
        <SessionReview
          diffs={diffs()}
          onViewFile={props.onOpenFile}
          actions={
            <div class="diff-view-toggle" role="group" aria-label="Diff view mode">
              <button
                type="button"
                class="diff-view-toggle-button"
                classList={{ active: diffStyle() === "unified" }}
                onClick={() => setDiffStyle("unified")}
                aria-pressed={diffStyle() === "unified"}
              >
                Unified
              </button>
              <button
                type="button"
                class="diff-view-toggle-button"
                classList={{ active: diffStyle() === "split" }}
                onClick={() => setDiffStyle("split")}
                aria-pressed={diffStyle() === "split"}
              >
                Split
              </button>
            </div>
          }
          renderDiff={(diff) => (
            <ReviewDiff
              workspaceId={props.workspaceId}
              filePath={diff.file}
              diffStyle={diffStyle}
            />
          )}
        />
      </Show>
    </div>
  );
}

