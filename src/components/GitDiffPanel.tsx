import { makePersisted } from "@solid-primitives/storage";
import { createMemo, createSignal, For, Show } from "solid-js";
import { DiffViewer } from "./DiffViewer";
import { createVcsFileDiffResource } from "../stores/vcsDiff";
import type { FileContents } from "@pierre/diffs";

type GitFile = {
  path: string;
  status: string;
  additions: number;
  deletions: number;
};

type GitDiffPanelProps = {
  workspaceId: string;
  branchName: string;
  totalAdditions: number;
  totalDeletions: number;
  fileStatus: string;
  error: string | null | undefined;
  files: GitFile[];
  onRecoverStale?: () => Promise<void>;
};

function splitPath(path: string) {
  const parts = path.split("/");
  if (parts.length === 1) {
    return { name: path, dir: "" };
  }
  return { name: parts[parts.length - 1], dir: parts.slice(0, -1).join("/") };
}

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

export function GitDiffPanel(props: GitDiffPanelProps) {
  const [selectedFile, setSelectedFile] = createSignal<GitFile>();
  const [diffStyle, setDiffStyle] = makePersisted(
    createSignal<"unified" | "split">("unified"),
    { name: "codexmonitor.diffStyle" },
  );
  const [filterQuery, setFilterQuery] = createSignal("");
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

  const selectedFilePath = createMemo(() => selectedFile()?.path);
  const diffResult = createVcsFileDiffResource({
    workspaceId: () => props.workspaceId,
    filePath: selectedFilePath,
  });

  const oldFile = createMemo((): FileContents | undefined => {
    const file = selectedFile();
    const result = diffResult();
    if (!file || !result) return undefined;

    return {
      name: file.path,
      contents: result.old_content,
      lang: getLangFromPath(file.path) as any,
    };
  });

  const newFile = createMemo((): FileContents | undefined => {
    const file = selectedFile();
    const result = diffResult();
    if (!file || !result) return undefined;

    return {
      name: file.path,
      contents: result.new_content,
      lang: getLangFromPath(file.path) as any,
    };
  });

  const filteredFiles = createMemo(() => {
    const query = filterQuery().trim().toLowerCase();
    const files = props.files;
    if (!query) {
      return files;
    }
    return files.filter((file) => file.path.toLowerCase().includes(query));
  });

  const statusLabel = (status: string) => {
    if (!status) return "";
    const normalized = status.trim().toUpperCase();
    if (["A", "M", "D", "R", "T", "C", "U"].includes(normalized)) {
      return normalized;
    }
    return normalized.slice(0, 1);
  };

  return (
    <aside class="diff-panel">
      <div class="diff-header">
        <span>VCS Diff</span>
        <div class="diff-header-right">
          <span class="diff-totals">
            +{props.totalAdditions} / -{props.totalDeletions}
          </span>
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
        </div>
      </div>

      <div class="diff-toolbar">
        <input
          class="diff-filter"
          type="text"
          value={filterQuery()}
          placeholder="Filter files…"
          spellcheck={false}
          onInput={(event) => setFilterQuery(event.currentTarget.value)}
        />
        <span class="diff-filter-count">
          {filteredFiles().length}/{props.files.length}
        </span>
      </div>
      <div class="diff-status">{props.fileStatus}</div>
      <div class="diff-branch">{props.branchName || "unknown"}</div>

      <Show when={selectedFile()}>
        <div class="diff-viewer-wrapper">
          <div class="diff-viewer-header">
            <span class="diff-viewer-filename">{selectedFile()!.path}</span>
            <button
              class="ghost diff-viewer-close"
              onClick={() => setSelectedFile(undefined)}
              aria-label="Close diff"
            >
              ×
            </button>
          </div>
          <Show when={diffResult.loading}>
            <div class="diff-loading">Loading diff...</div>
          </Show>
          <Show when={!diffResult.loading && diffResult()}>
            <DiffViewer
              oldFile={oldFile()}
              newFile={newFile()}
              diffStyle={diffStyle()}
            />
          </Show>
          <Show when={diffResult.error}>
            <div class="diff-error">{String(diffResult.error)}</div>
          </Show>
        </div>
      </Show>

      <div class="diff-list">
        <Show when={props.error}>
          {(message) => (
            <>
              <div class="diff-error">{message()}</div>
              <Show when={props.onRecoverStale && isStaleError()}>
                <button
                  type="button"
                  class="secondary diff-recover"
                  onClick={() => void handleRecoverStale()}
                  disabled={recovering()}
                >
                  {recovering() ? "Updating…" : "Update stale working copy"}
                </button>
              </Show>
            </>
          )}
        </Show>
        <Show when={!props.error && !props.files.length}>
          <div class="diff-empty">No changes detected.</div>
        </Show>
        <Show when={!props.error && props.files.length > 0 && !filteredFiles().length}>
          <div class="diff-empty">No files match the current filter.</div>
        </Show>
        <For each={filteredFiles()}>
          {(file) => {
            const { name } = splitPath(file.path);
            const isSelected = () => selectedFile()?.path === file.path;
            const status = () => statusLabel(file.status);
            return (
              <div
                class="diff-row"
                classList={{ selected: isSelected() }}
                onClick={() => setSelectedFile(isSelected() ? undefined : file)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedFile(isSelected() ? undefined : file);
                  }
                }}
              >
                <Show when={status()}>
                  {(label) => (
                    <span
                      class={`diff-status-badge diff-status-badge--${label()}`}
                      title={`Status: ${label()}`}
                    >
                      {label()}
                    </span>
                  )}
                </Show>
                <span class="diff-icon" aria-hidden>
                  <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
                    <rect
                      x="4"
                      y="2"
                      width="16"
                      height="20"
                      rx="2"
                      stroke="currentColor"
                      stroke-width="1.5"
                    />
                    <path
                      d="M8 7h8M8 11h8M8 15h4"
                      stroke="currentColor"
                      stroke-width="1.5"
                      stroke-linecap="round"
                    />
                  </svg>
                </span>
                <div class="diff-file">
                  <div class="diff-path">
                    <span>{name}</span>
                    <span class="diff-counts-inline">
                      <span class="diff-add">+{file.additions}</span>
                      <span class="diff-sep">/</span>
                      <span class="diff-del">-{file.deletions}</span>
                    </span>
                  </div>
                </div>
              </div>
            );
          }}
        </For>
      </div>
    </aside>
  );
}
