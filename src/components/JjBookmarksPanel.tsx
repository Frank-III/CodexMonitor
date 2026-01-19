import { For, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { Button, IconButton } from "../ui";
import type { JjBookmarkInfo, VcsLogEntry } from "../types";

type JjBookmarksPanelProps = {
  contextWorkspaceName: string | null | undefined;
  bookmarks: JjBookmarkInfo[];
  isLoading: boolean;
  error: string | null | undefined;
  currentBaseRevset: string | null | undefined;
  ahead: number | null | undefined;
  behind: number | null | undefined;
  recentRevisions: VcsLogEntry[];
  recentIsLoading: boolean;
  recentError: string | null | undefined;
  onRefreshRecent: () => void;
  onNewBookmark: () => void;
  onRenameBookmark: (bookmark: JjBookmarkInfo) => void;
  onMoveBookmark: (bookmark: JjBookmarkInfo) => void;
  onDeleteBookmark: (bookmark: JjBookmarkInfo) => void;
  onFetchRemote: () => Promise<void>;
  onPushTracked: () => Promise<void>;
  onPushDeleted: () => Promise<void>;
  onPushBookmark: (bookmark: JjBookmarkInfo) => Promise<void>;
  onTrackRemoteBookmark: (bookmark: JjBookmarkInfo) => Promise<void>;
  onUntrackRemoteBookmark: (bookmark: JjBookmarkInfo) => Promise<void>;
  onRefresh: () => void;
  onEditBase: () => void;
  onSetBaseRevset: (revset: string) => Promise<void>;
};

function formatTimestamp(unixSeconds: number) {
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
}

export function JjBookmarksPanel(props: JjBookmarksPanelProps) {
  const baseLabel = () => (props.currentBaseRevset?.trim() ? props.currentBaseRevset!.trim() : "auto");
  const divergenceLabel = () => {
    const ahead = props.ahead ?? null;
    const behind = props.behind ?? null;
    if (ahead === null || behind === null) {
      return null;
    }
    return `+${ahead} / -${behind}`;
  };
  const [state, setState] = createStore<{
    error: string | null;
    settingBase: string | null;
    remoteAction: string | null;
    customBase: string;
  }>({
    error: null,
    settingBase: null,
    remoteAction: null,
    customBase: "",
  });

  const isBusy = () => !!state.settingBase || !!state.remoteAction;

  const handleSetBase = async (revset: string) => {
    if (isBusy()) {
      return;
    }
    setState({ settingBase: revset, error: null });
    try {
      await props.onSetBaseRevset(revset);
    } catch (err) {
      setState({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      setState("settingBase", null);
    }
  };

  const handleApplyCustomBase = () => {
    const trimmed = state.customBase.trim();
    if (!trimmed) {
      return;
    }
    void handleSetBase(trimmed);
  };

  const handleFetchRemote = async () => {
    if (isBusy()) {
      return;
    }
    setState({ remoteAction: "fetch", error: null });
    try {
      await props.onFetchRemote();
    } catch (err) {
      setState({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      setState("remoteAction", null);
    }
  };

  const handlePushTracked = async () => {
    if (isBusy()) {
      return;
    }
    setState({ remoteAction: "pushTracked", error: null });
    try {
      await props.onPushTracked();
    } catch (err) {
      setState({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      setState("remoteAction", null);
    }
  };

  const handlePushDeleted = async () => {
    if (isBusy()) {
      return;
    }
    setState({ remoteAction: "pushDeleted", error: null });
    try {
      await props.onPushDeleted();
    } catch (err) {
      setState({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      setState("remoteAction", null);
    }
  };

  const handlePushBookmark = async (bookmark: JjBookmarkInfo) => {
    if (isBusy()) {
      return;
    }
    setState({ remoteAction: `push:${bookmark.name}`, error: null });
    try {
      await props.onPushBookmark(bookmark);
    } catch (err) {
      setState({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      setState("remoteAction", null);
    }
  };

  const handleTrackRemoteBookmark = async (bookmark: JjBookmarkInfo) => {
    if (isBusy()) {
      return;
    }
    setState({ remoteAction: `track:${bookmark.symbol}`, error: null });
    try {
      await props.onTrackRemoteBookmark(bookmark);
    } catch (err) {
      setState({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      setState("remoteAction", null);
    }
  };

  const handleUntrackRemoteBookmark = async (bookmark: JjBookmarkInfo) => {
    if (isBusy()) {
      return;
    }
    setState({ remoteAction: `untrack:${bookmark.symbol}`, error: null });
    try {
      await props.onUntrackRemoteBookmark(bookmark);
    } catch (err) {
      setState({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      setState("remoteAction", null);
    }
  };

  return (
    <aside class="bookmarks-panel">
      <div class="bookmarks-header">
        <span>Bookmarks</span>
        <div class="bookmarks-header-actions">
          <Button
            type="button"
            variant="secondary"
            size="small"
            class="bookmarks-header-action"
            onClick={props.onNewBookmark}
            aria-label="Create bookmark"
            title="New bookmark"
          >
            + New…
          </Button>
          <IconButton
            type="button"
            icon="arrow-down"
            variant="ghost"
            class="bookmarks-header-icon"
            onClick={() => void handleFetchRemote()}
            disabled={isBusy()}
            aria-label="Fetch from remote"
            title="Fetch from remote"
          />
          <IconButton
            type="button"
            icon="arrow-up"
            variant="ghost"
            class="bookmarks-header-icon"
            onClick={() => void handlePushTracked()}
            disabled={isBusy()}
            aria-label="Push tracked bookmarks"
            title="Push tracked bookmarks"
          />
          <IconButton
            type="button"
            icon="trash"
            variant="ghost"
            class="bookmarks-header-icon"
            onClick={() => void handlePushDeleted()}
            disabled={isBusy()}
            aria-label="Push deleted bookmarks"
            title="Push deleted bookmarks"
          />
          <Button
            type="button"
            variant="secondary"
            size="small"
            class="bookmarks-header-action"
            onClick={props.onEditBase}
            aria-label="Edit divergence base"
            title="Edit base"
          >
            Base…
          </Button>
          <IconButton
            type="button"
            icon="refresh"
            variant="ghost"
            class="bookmarks-header-icon"
            onClick={props.onRefresh}
            disabled={props.isLoading}
            aria-label="Refresh bookmarks"
            title="Refresh"
          />
        </div>
      </div>

      <div class="bookmarks-meta">
        Base revset: <code class="bookmarks-meta-code">{baseLabel()}</code>
        <Show when={divergenceLabel()}>
          {(label) => <span class="bookmarks-meta-divergence">{label()}</span>}
        </Show>
        <Show when={props.contextWorkspaceName}>
          {(name) => <span class="bookmarks-meta-context">from {name()}</span>}
        </Show>
      </div>

      <Show when={props.error}>
        <div class="bookmarks-error">{props.error}</div>
      </Show>
      <Show when={state.error}>
        <div class="bookmarks-error">{state.error}</div>
      </Show>

      <div class="bookmarks-base-form">
        <input
          class="bookmarks-base-input"
          type="text"
          value={state.customBase}
          placeholder="Set base revset… (e.g. trunk(), @-, main@origin, <commit>)"
          onInput={(event) => setState("customBase", event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              handleApplyCustomBase();
            }
          }}
          spellcheck={false}
        />
        <Button
          type="button"
          variant="secondary"
          size="large"
          class="bookmarks-base-apply"
          onClick={handleApplyCustomBase}
          disabled={!state.customBase.trim() || isBusy()}
        >
          Set
        </Button>
      </div>

      <div class="bookmarks-base-quick">
        <button type="button" class="bookmarks-quick" onClick={() => void handleSetBase("trunk()")} disabled={isBusy()}>
          trunk()
        </button>
        <button type="button" class="bookmarks-quick" onClick={() => void handleSetBase("main")} disabled={isBusy()}>
          main
        </button>
        <button type="button" class="bookmarks-quick" onClick={() => void handleSetBase("@-")} disabled={isBusy()}>
          @-
        </button>
        <button type="button" class="bookmarks-quick" onClick={() => void handleSetBase("@")} disabled={isBusy()}>
          @
        </button>
        <button
          type="button"
          class="bookmarks-quick"
          onClick={() => void handleSetBase("main@origin")}
          disabled={isBusy()}
        >
          main@origin
        </button>
      </div>

      <div class="bookmarks-revisions">
        <div class="bookmarks-revisions-header">
          <span>Recent revisions</span>
          <IconButton
            type="button"
            icon="refresh"
            variant="ghost"
            class="bookmarks-revisions-refresh"
            onClick={props.onRefreshRecent}
            disabled={props.recentIsLoading}
            aria-label="Refresh recent revisions"
            title="Refresh"
          />
        </div>
        <Show when={props.recentError}>
          <div class="bookmarks-error">{props.recentError}</div>
        </Show>
        <div class="bookmarks-revisions-list">
          <Show when={props.recentIsLoading}>
            <div class="bookmarks-empty">Loading revisions…</div>
          </Show>
          <Show when={!props.recentIsLoading && !props.recentError && !props.recentRevisions.length}>
            <div class="bookmarks-empty">No revisions found.</div>
          </Show>
          <For each={props.recentRevisions.slice(0, 14)}>
            {(entry) => (
              <button
                type="button"
                class="bookmarks-revision-row"
                disabled={isBusy()}
                onClick={() => {
                  setState("customBase", entry.sha);
                  void handleSetBase(entry.sha);
                }}
              >
                <div class="bookmarks-revision-top">
                  <div class="bookmarks-revision-summary">
                    {entry.summary || "(no description)"}
                  </div>
                  <code class="bookmarks-revision-sha">{entry.sha.slice(0, 10)}</code>
                </div>
                <div class="bookmarks-revision-meta">
                  {entry.author} · {formatTimestamp(entry.timestamp)}
                </div>
              </button>
            )}
          </For>
        </div>
      </div>

      <div class="bookmarks-list">
        <Show when={props.isLoading}>
          <div class="bookmarks-empty">Loading…</div>
        </Show>

        <Show when={!props.isLoading && !props.error && props.bookmarks.length === 0}>
          <div class="bookmarks-empty">No bookmarks found.</div>
        </Show>

        <For each={props.bookmarks}>
          {(bookmark) => {
            const isActive = () => (props.currentBaseRevset?.trim() ?? "") === bookmark.symbol.trim();
            const isSettingThis = () => state.settingBase === bookmark.symbol;
            const canSetBase = () => !bookmark.conflict && !!bookmark.commitId && !isBusy();
            const isPushingThis = () => state.remoteAction === `push:${bookmark.name}`;
            const isTrackingThis = () => state.remoteAction === `track:${bookmark.symbol}`;
            const isUntrackingThis = () => state.remoteAction === `untrack:${bookmark.symbol}`;
            const commitShort = () =>
              bookmark.changeId?.slice(0, 12) ??
              bookmark.commitId?.slice(0, 12) ??
              "";
            const meta = () => {
              const parts: string[] = [];
              if (bookmark.remote) {
                parts.push(`@${bookmark.remote}`);
              }
              if (bookmark.author) {
                parts.push(bookmark.author);
              }
              if (bookmark.timestamp) {
                const rendered = formatTimestamp(bookmark.timestamp);
                if (rendered) {
                  parts.push(rendered);
                }
              }
              return parts.join(" · ");
            };

            return (
              <div
                class="bookmarks-row"
                classList={{
                  active: isActive(),
                  disabled: !canSetBase(),
                }}
                role="button"
                tabIndex={0}
                aria-disabled={!canSetBase()}
                onClick={() => {
                  if (!canSetBase()) {
                    return;
                  }
                  void handleSetBase(bookmark.symbol);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    if (!canSetBase()) {
                      return;
                    }
                    void handleSetBase(bookmark.symbol);
                  }
                }}
                title={
                  bookmark.conflict
                    ? "Bookmark target is conflicted."
                    : bookmark.commitId
                      ? `Set base to ${bookmark.symbol}`
                      : "Bookmark has no target commit."
                }
              >
                <div class="bookmarks-row-top">
                  <code class="bookmarks-row-symbol">{bookmark.symbol}</code>
                  <Show when={isSettingThis()}>
                    <span class="bookmarks-row-badge bookmarks-row-badge-setting">setting</span>
                  </Show>
                  <Show when={isPushingThis()}>
                    <span class="bookmarks-row-badge bookmarks-row-badge-setting">pushing</span>
                  </Show>
                  <Show when={isTrackingThis()}>
                    <span class="bookmarks-row-badge bookmarks-row-badge-setting">tracking</span>
                  </Show>
                  <Show when={isUntrackingThis()}>
                    <span class="bookmarks-row-badge bookmarks-row-badge-setting">untracking</span>
                  </Show>
                  <Show when={bookmark.kind === "remote" && bookmark.tracked}>
                    <span class="bookmarks-row-badge bookmarks-row-badge-setting">tracked</span>
                  </Show>
                  <Show when={bookmark.conflict}>
                    <span class="bookmarks-row-badge">conflict</span>
                  </Show>
                  <Show when={commitShort()}>
                    <code class="bookmarks-row-commit">{commitShort()}</code>
                  </Show>
                  <div class="bookmarks-row-actions">
                    <Show when={bookmark.kind === "local"}>
                      <IconButton
                        type="button"
                        icon="arrow-up"
                        variant="ghost"
                        class="bookmarks-row-action"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handlePushBookmark(bookmark);
                        }}
                        disabled={isBusy()}
                        aria-label={`Push bookmark ${bookmark.name}`}
                        title="Push bookmark"
                      />
                      <IconButton
                        type="button"
                        icon="edit"
                        variant="ghost"
                        class="bookmarks-row-action"
                        onClick={(event) => {
                          event.stopPropagation();
                          props.onRenameBookmark(bookmark);
                        }}
                        disabled={isBusy()}
                        aria-label={`Rename bookmark ${bookmark.name}`}
                        title="Rename bookmark"
                      />
                      <IconButton
                        type="button"
                        icon="arrow-branch"
                        variant="ghost"
                        class="bookmarks-row-action"
                        onClick={(event) => {
                          event.stopPropagation();
                          props.onMoveBookmark(bookmark);
                        }}
                        disabled={isBusy()}
                        aria-label={`Move bookmark ${bookmark.name}`}
                        title="Move bookmark"
                      />
                      <IconButton
                        type="button"
                        icon="trash"
                        variant="ghost"
                        class="bookmarks-row-action destructive"
                        onClick={(event) => {
                          event.stopPropagation();
                          props.onDeleteBookmark(bookmark);
                        }}
                        disabled={isBusy()}
                        aria-label={`Delete bookmark ${bookmark.name}`}
                        title="Delete bookmark"
                      />
                    </Show>
                    <Show when={bookmark.kind === "remote"}>
                      <IconButton
                        type="button"
                        icon={bookmark.tracked ? "minus" : "plus"}
                        variant="ghost"
                        class="bookmarks-row-action"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (bookmark.tracked) {
                            void handleUntrackRemoteBookmark(bookmark);
                          } else {
                            void handleTrackRemoteBookmark(bookmark);
                          }
                        }}
                        disabled={isBusy() || !bookmark.remote}
                        aria-label={
                          bookmark.tracked
                            ? `Untrack remote bookmark ${bookmark.symbol}`
                            : `Track remote bookmark ${bookmark.symbol}`
                        }
                        title={bookmark.tracked ? "Untrack bookmark" : "Track bookmark"}
                      />
                    </Show>
                  </div>
                </div>
                <div class="bookmarks-row-summary">
                  {bookmark.summary?.trim() ? bookmark.summary : "(no description)"}
                </div>
                <Show when={meta()}>
                  <div class="bookmarks-row-meta">{meta()}</div>
                </Show>
              </div>
            );
          }}
        </For>
      </div>
    </aside>
  );
}
