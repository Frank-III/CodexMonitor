import { For, Show, type Accessor } from "solid-js";

type GitDiffPanelProps = {
  branchName: Accessor<string>;
  totalAdditions: Accessor<number>;
  totalDeletions: Accessor<number>;
  fileStatus: Accessor<string>;
  error: Accessor<string | null | undefined>;
  files: Accessor<{
    path: string;
    status: string;
    additions: number;
    deletions: number;
  }[]>;
};

function splitPath(path: string) {
  const parts = path.split("/");
  if (parts.length === 1) {
    return { name: path, dir: "" };
  }
  return { name: parts[parts.length - 1], dir: parts.slice(0, -1).join("/") };
}

function extensionForPath(path: string) {
  const parts = path.split(".");
  if (parts.length <= 1) {
    return "";
  }
  return parts[parts.length - 1].toLowerCase();
}

export function GitDiffPanel(props: GitDiffPanelProps) {
  return (
    <aside class="diff-panel">
      <div class="diff-header">
        <span>Git Diff</span>
        <span class="diff-totals">
          +{props.totalAdditions()} / -{props.totalDeletions()}
        </span>
      </div>
      <div class="diff-status">{props.fileStatus()}</div>
      <div class="diff-branch">{props.branchName() || "unknown"}</div>
      <div class="diff-list">
        <Show when={props.error()}>
          <div class="diff-error">{props.error()}</div>
        </Show>
        <Show when={!props.error() && !props.files().length}>
          <div class="diff-empty">No changes detected.</div>
        </Show>
        <For each={props.files()}>
          {(file) => {
            const { name, dir } = splitPath(file.path);
            const extension = extensionForPath(file.path);
            return (
              <div class="diff-row">
                <span class="diff-icon" aria-hidden>
                  <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
                    <rect x="4" y="2" width="16" height="20" rx="2" stroke="currentColor" stroke-width="1.5" />
                    <path d="M8 7h8M8 11h8M8 15h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
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
