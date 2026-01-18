import { For, Show } from "solid-js";
import type { GitHubIssue } from "../types";

const openUrl = (url: string) => window.open(url, "_blank");

type GitHubIssuesPanelProps = {
  total: number;
  issues: GitHubIssue[];
  isLoading: boolean;
  error: string | null | undefined;
  onRefresh: () => void;
};

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

export function GitHubIssuesPanel(props: GitHubIssuesPanelProps) {
  return (
    <aside class="issues-panel">
      <div class="issues-header">
        <span>GitHub Issues</span>
        <button
          type="button"
          class="ghost icon-button issues-refresh"
          onClick={props.onRefresh}
          aria-label="Refresh issues"
        >
          ↻
        </button>
      </div>

      <Show when={props.isLoading}>
        <div class="issues-meta">Loading…</div>
      </Show>
      <Show when={!props.isLoading}>
        <div class="issues-meta">
          {props.total
            ? `Showing ${props.issues.length} of ${props.total} open issues`
            : props.issues.length
              ? `Showing ${props.issues.length} issues`
              : "No issues loaded"}
        </div>
      </Show>

      <Show when={props.error}>
        <div class="issues-error">{props.error}</div>
      </Show>

      <div class="issues-list">
        <Show when={!props.error && !props.isLoading && !props.issues.length}>
          <div class="issues-empty">No open issues found.</div>
        </Show>

        <For each={props.issues}>
          {(issue) => (
            <button
              type="button"
              class="issues-row"
              onClick={() => openUrl(issue.url)}
            >
              <div class="issues-row-title">
                <span class="issues-row-number">#{issue.number}</span>{" "}
                <span>{issue.title}</span>
              </div>
              <div class="issues-row-updated">
                Updated {formatUpdatedAt(issue.updatedAt)}
              </div>
            </button>
          )}
        </For>
      </div>
    </aside>
  );
}

