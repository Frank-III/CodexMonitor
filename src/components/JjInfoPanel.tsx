import { For, Show, createMemo } from "solid-js";
import { createStore } from "solid-js/store";
import type { JjBookmarkInfo, VcsLogEntry, WorkspaceInfo, WorktreeDivergence } from "../types";

type JjInfoPanelProps = {
  workspace: WorkspaceInfo;
  divergence: WorktreeDivergence | null;
  branchName: string;
  fileStatus: string;
  totalAdditions: number;
  totalDeletions: number;
  vcsError?: string | null;
  graph: string;
  graphIsLoading: boolean;
  graphError?: string | null;
  onRefreshGraph: () => void;
  bookmarks: JjBookmarkInfo[];
  bookmarksIsLoading: boolean;
  bookmarksError?: string | null;
  onOpenGraphTab: () => void;
  onOpenBookmarksTab: () => void;
  onEditBase: () => void;
  onSyncWorktree: () => void;
  syncStackCount?: number;
  onSyncStack?: () => void;
  landStackCount?: number;
  onLandStack?: () => void;
  onLandWorktree: () => void;
  onFetchRemote: () => Promise<void>;
  onPushTracked: () => Promise<void>;
  onPushDeleted: () => Promise<void>;
  baseRevisions: VcsLogEntry[];
  baseRevisionsIsLoading: boolean;
  baseRevisionsError?: string | null;
  onRefreshBaseRevisions: () => void;
  onSetBaseRevset: (revset: string) => Promise<void>;
};

const graphPreview = (graph: string, lines = 10) => {
  const trimmed = graph.trimEnd();
  if (!trimmed) return "";
  const split = trimmed.split("\n");
  const slice = split.slice(0, lines).join("\n");
  return split.length > lines ? `${slice}\n…` : slice;
};

export function JjInfoPanel(props: JjInfoPanelProps) {
  const [state, setState] = createStore<{
    remoteAction: "fetch" | "pushTracked" | "pushDeleted" | null;
    remoteError: string | null;
    baseAction: "setBase" | null;
    baseError: string | null;
    baseDraftWorkspaceId: string | null;
    baseDraft: string;
  }>({
    remoteAction: null,
    remoteError: null,
    baseAction: null,
    baseError: null,
    baseDraftWorkspaceId: null,
    baseDraft: "",
  });

  const isWorktree = () => props.workspace.kind === "worktree";
  const currentBaseRevset = () =>
    props.divergence?.base_revset ??
    props.workspace.base_revset ??
    (isWorktree() ? "@-" : "trunk()");
  const baseDraftValue = () =>
    state.baseDraftWorkspaceId === props.workspace.id
      ? state.baseDraft
      : currentBaseRevset();
  const baseIsBusy = () => !!state.baseAction;
  const baseIsDirty = () => baseDraftValue().trim() !== currentBaseRevset().trim();
  const basePresets = () => ["@-", "trunk()", "main", "master"];

  const divergenceLabel = () => {
    if (!props.divergence) return null;
    return `+${props.divergence.ahead} / -${props.divergence.behind}`;
  };

  const formatTimestamp = (unixSeconds: number) => {
    const date = new Date(unixSeconds * 1000);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const setBaseDraft = (value: string) => {
    setState({
      baseDraftWorkspaceId: props.workspace.id,
      baseDraft: value,
      baseError: null,
    });
  };

  const applyBasePreset = (preset: string) => {
    if (baseIsBusy()) {
      return;
    }
    setBaseDraft(preset);
  };

  const applyBaseRevision = (revision: VcsLogEntry) => {
    if (baseIsBusy()) {
      return;
    }
    setBaseDraft(revision.sha);
  };

  const runBaseAction = async () => {
    if (baseIsBusy()) {
      return;
    }
    const trimmed = baseDraftValue().trim();
    if (!trimmed) {
      setState("baseError", "Base revset is required.");
      return;
    }

    setState({ baseAction: "setBase", baseError: null });
    try {
      await props.onSetBaseRevset(trimmed);
    } catch (err) {
      setState({ baseError: err instanceof Error ? err.message : String(err) });
      return;
    } finally {
      setState("baseAction", null);
    }

    setState({
      baseDraftWorkspaceId: props.workspace.id,
      baseDraft: trimmed,
    });
  };

  const bookmarksSummary = createMemo(() => {
    const local = props.bookmarks.filter((b) => b.kind === "local");
    const remote = props.bookmarks.filter((b) => b.kind === "remote");
    const trackedRemote = remote.filter((b) => b.tracked);
    const localNames = new Set(local.map((b) => b.name));
    const deletedCandidates = trackedRemote.filter((b) => !localNames.has(b.name));
    const deletedCandidateSymbols = Array.from(
      new Set(deletedCandidates.map((b) => b.symbol)),
    ).sort((a, b) => a.localeCompare(b));
    const conflicts = props.bookmarks.filter((b) => b.conflict);

    return {
      localCount: local.length,
      remoteCount: remote.length,
      trackedRemoteCount: trackedRemote.length,
      deletedCandidatesCount: deletedCandidateSymbols.length,
      deletedCandidateSymbols,
      conflictsCount: conflicts.length,
    };
  });

  const deletedToPushSymbols = () => bookmarksSummary().deletedCandidateSymbols;
  const canPushDeleted = () =>
    !props.bookmarksIsLoading &&
    !props.bookmarksError &&
    deletedToPushSymbols().length > 0;

  const canSync = () => isWorktree() && (props.divergence?.behind ?? 0) > 0;

  const runRemoteAction = async (
    action: "fetch" | "pushTracked" | "pushDeleted",
  ) => {
    if (state.remoteAction) {
      return;
    }
    setState({ remoteAction: action, remoteError: null });
    try {
      if (action === "fetch") {
        await props.onFetchRemote();
      } else if (action === "pushTracked") {
        await props.onPushTracked();
      } else {
        await props.onPushDeleted();
      }
    } catch (err) {
      setState({
        remoteError: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setState("remoteAction", null);
    }
  };

  return (
    <aside class="info-panel">
      <div class="info-card">
        <div class="info-card-header">
          <span>Workspace</span>
          <span class="info-pill">{props.workspace.kind}</span>
        </div>
        <div class="info-title">{props.workspace.name}</div>
        <div class="info-meta info-mono">{props.workspace.path}</div>
        <Show when={isWorktree() && props.divergence}>
          <div class="info-kv">
            <span class="info-kv-label">Base</span>
            <span class="info-kv-value">
              {props.divergence?.base_name ?? "parent"}{" "}
              <span class="info-kv-muted info-mono">
                ({props.divergence?.base_revset})
              </span>
            </span>
          </div>
        </Show>
      </div>

      <div class="info-card">
        <div class="info-card-header">
          <span>Working Copy</span>
          <span class="info-mono info-kv-muted">{props.branchName}</span>
        </div>
        <div class="info-kv">
          <span class="info-kv-label">Status</span>
          <span class="info-kv-value">{props.fileStatus}</span>
        </div>
        <div class="info-kv">
          <span class="info-kv-label">Diff</span>
          <span class="info-kv-value info-mono">
            +{props.totalAdditions} / -{props.totalDeletions}
          </span>
        </div>
        <Show when={props.vcsError}>
          {(err) => <div class="info-error">{err()}</div>}
        </Show>
      </div>

      <div class="info-card">
        <div class="info-card-header">
          <span>Divergence</span>
          <Show when={divergenceLabel()}>
            {(label) => <span class="info-mono info-kv-muted">{label()}</span>}
          </Show>
        </div>
        <div class="info-kv">
          <span class="info-kv-label">Base revset</span>
          <span class="info-kv-value info-mono">
            {props.divergence?.base_revset ?? props.workspace.base_revset ?? "auto"}
          </span>
        </div>
        <div class="info-base-input-row">
          <input
            class="info-base-input info-mono"
            type="text"
            spellcheck={false}
            value={baseDraftValue()}
            placeholder={isWorktree() ? "@-" : "trunk()"}
            onInput={(event) => setBaseDraft(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void runBaseAction();
              }
            }}
            disabled={baseIsBusy()}
            aria-label="Set divergence base revset"
          />
          <button
            type="button"
            class="ghost info-action"
            disabled={baseIsBusy() || !baseIsDirty()}
            onClick={() => void runBaseAction()}
          >
            {state.baseAction ? "Setting…" : "Set"}
          </button>
        </div>
        <div class="info-base-presets" role="list" aria-label="Base revset presets">
          <For each={basePresets()}>
            {(preset) => (
              <button
                type="button"
                class="info-tag"
                disabled={baseIsBusy()}
                onClick={() => applyBasePreset(preset)}
              >
                {preset}
              </button>
            )}
          </For>
        </div>
        <div class="info-kv">
          <span class="info-kv-label">Recent</span>
          <span class="info-kv-value">
            <button
              type="button"
              class="ghost info-action"
              onClick={props.onRefreshBaseRevisions}
              disabled={props.baseRevisionsIsLoading}
              title="Refresh revisions"
            >
              ↻
            </button>
          </span>
        </div>
        <Show when={props.baseRevisionsError}>
          {(err) => <div class="info-error">{err()}</div>}
        </Show>
        <Show when={!props.baseRevisionsError}>
          <div class="info-rev-list" aria-label="Recent revisions">
            <Show
              when={!props.baseRevisionsIsLoading && props.baseRevisions.length > 0}
              fallback={
                <div class="info-meta">
                  {props.baseRevisionsIsLoading
                    ? "Loading revisions…"
                    : "No revisions found."}
                </div>
              }
            >
              <For each={props.baseRevisions.slice(0, 8)}>
                {(entry) => (
                  <button
                    type="button"
                    class="info-rev-row"
                    classList={{
                      "is-active": baseDraftValue().trim() === entry.sha,
                    }}
                    onClick={() => applyBaseRevision(entry)}
                    disabled={baseIsBusy()}
                  >
                    <div class="info-rev-summary">
                      {entry.summary?.trim() ? entry.summary : "(no description)"}
                    </div>
                    <div class="info-rev-meta info-mono">
                      <span class="info-rev-author">{entry.author}</span>
                      <span class="info-rev-sep">·</span>
                      <span>{formatTimestamp(entry.timestamp)}</span>
                      <span class="info-rev-sep">·</span>
                      <span>{entry.sha.slice(0, 10)}</span>
                    </div>
                  </button>
                )}
              </For>
            </Show>
          </div>
        </Show>
        <Show when={state.baseError}>
          {(err) => <div class="info-error">{err()}</div>}
        </Show>
        <div class="info-actions-row">
          <button
            type="button"
            class="ghost info-action"
            onClick={props.onEditBase}
          >
            Base…
          </button>
          <Show when={isWorktree()}>
            <button
              type="button"
              class="ghost info-action"
              onClick={props.onSyncWorktree}
              disabled={!canSync()}
              title={
                canSync()
                  ? `Behind ${props.divergence?.behind ?? 0}`
                  : "Already up to date"
              }
            >
              Sync
            </button>
            <Show when={(props.syncStackCount ?? 0) > 0 && props.onSyncStack}>
              <button
                type="button"
                class="ghost info-action"
                onClick={() => props.onSyncStack?.()}
                title="Sync this worktree and downstream worktrees"
              >
                Sync stack <span class="info-mono">+{props.syncStackCount}</span>
              </button>
            </Show>
            <Show when={(props.landStackCount ?? 0) > 0 && props.onLandStack}>
              <button
                type="button"
                class="ghost info-action info-action-destructive"
                onClick={() => props.onLandStack?.()}
                title="Land this worktree and downstream worktrees"
              >
                Land stack <span class="info-mono">+{props.landStackCount}</span>
              </button>
            </Show>
            <button
              type="button"
              class="ghost info-action info-action-destructive"
              onClick={props.onLandWorktree}
            >
              Land…
            </button>
          </Show>
        </div>
      </div>

      <div class="info-card">
        <div class="info-card-header">
          <span>Bookmarks</span>
          <div class="info-actions-inline">
            <button
              type="button"
              class="ghost info-action"
              onClick={props.onOpenBookmarksTab}
            >
              Open
            </button>
          </div>
        </div>

        <Show
          when={!props.bookmarksIsLoading && !props.bookmarksError}
          fallback={
            <div class="info-meta">
              {props.bookmarksIsLoading
                ? "Loading bookmarks…"
                : props.bookmarksError
                  ? String(props.bookmarksError)
                  : ""}
            </div>
          }
        >
          <>
            <div class="info-kv">
              <span class="info-kv-label">Local / Remote</span>
              <span class="info-kv-value info-mono">
                {bookmarksSummary().localCount} / {bookmarksSummary().remoteCount}
              </span>
            </div>
            <div class="info-kv">
              <span class="info-kv-label">Tracked remotes</span>
              <span class="info-kv-value info-mono">{bookmarksSummary().trackedRemoteCount}</span>
            </div>
            <Show when={bookmarksSummary().deletedCandidatesCount > 0}>
              <div class="info-kv">
                <span class="info-kv-label">Deleted to push</span>
                <span class="info-kv-value info-mono">
                  {bookmarksSummary().deletedCandidatesCount}
                </span>
              </div>
              <div class="info-tags" aria-label="Deleted-to-push bookmarks">
                <For each={bookmarksSummary().deletedCandidateSymbols.slice(0, 6)}>
                  {(symbol) => (
                    <span class="info-tag info-tag--muted" title={symbol}>
                      {symbol}
                    </span>
                  )}
                </For>
                <Show when={bookmarksSummary().deletedCandidateSymbols.length > 6}>
                  <span class="info-tag info-tag--muted">
                    +{bookmarksSummary().deletedCandidateSymbols.length - 6} more
                  </span>
                </Show>
              </div>
            </Show>
            <Show when={bookmarksSummary().conflictsCount > 0}>
              <div class="info-kv">
                <span class="info-kv-label">Conflicts</span>
                <span class="info-kv-value info-mono">{bookmarksSummary().conflictsCount}</span>
              </div>
            </Show>
          </>
        </Show>

        <div class="info-actions-row">
          <button
            type="button"
            class="ghost info-action"
            disabled={!!state.remoteAction}
            onClick={() => void runRemoteAction("fetch")}
            title="jj git fetch"
          >
            {state.remoteAction === "fetch" ? "Fetching…" : "Fetch"}
          </button>
          <button
            type="button"
            class="ghost info-action"
            disabled={!!state.remoteAction}
            onClick={() => void runRemoteAction("pushTracked")}
            title="jj git push --tracked"
          >
            {state.remoteAction === "pushTracked" ? "Pushing…" : "Push tracked"}
          </button>
          <button
            type="button"
            class="ghost info-action"
            disabled={!!state.remoteAction || !canPushDeleted()}
            onClick={() => void runRemoteAction("pushDeleted")}
            title="jj git push --deleted"
          >
            {state.remoteAction === "pushDeleted" ? "Pushing…" : "Push deleted"}
          </button>
        </div>
        <Show when={state.remoteError}>
          {(err) => <div class="info-error">{err()}</div>}
        </Show>
      </div>

      <div class="info-card info-card--scroll">
        <div class="info-card-header">
          <span>Graph</span>
          <div class="info-actions-inline">
            <button
              type="button"
              class="ghost info-action"
              onClick={props.onRefreshGraph}
              disabled={props.graphIsLoading}
              title="Refresh graph"
            >
              ↻
            </button>
            <button
              type="button"
              class="ghost info-action"
              onClick={props.onOpenGraphTab}
            >
              Open
            </button>
          </div>
        </div>

        <Show when={props.graphIsLoading}>
          <div class="info-meta">Loading graph…</div>
        </Show>
        <Show when={!props.graphIsLoading && props.graphError}>
          {(err) => <div class="info-error">{err()}</div>}
        </Show>
        <Show when={!props.graphIsLoading && !props.graphError}>
          <Show
            when={props.graph.trim()}
            fallback={<div class="info-meta">No graph.</div>}
          >
            <pre class="info-graph">{graphPreview(props.graph, 10)}</pre>
          </Show>
        </Show>
      </div>
    </aside>
  );
}
