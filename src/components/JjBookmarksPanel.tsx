import { For, Show } from "solid-js";
import { createStore } from "solid-js/store";
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
          <button
            type="button"
            class="ghost icon-button bookmarks-header-action"
            onClick={props.onNewBookmark}
            aria-label="Create bookmark"
            title="New bookmark"
          >
            + New…
          </button>
          <button
            type="button"
            class="ghost icon-button bookmarks-header-icon"
            onClick={() => void handleFetchRemote()}
            disabled={isBusy()}
            aria-label="Fetch from remote"
            title="Fetch from remote"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 7v10"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
              />
              <path
                d="M8 13l4 4 4-4"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            class="ghost icon-button bookmarks-header-icon"
            onClick={() => void handlePushTracked()}
            disabled={isBusy()}
            aria-label="Push tracked bookmarks"
            title="Push tracked bookmarks"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 17V7"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
              />
              <path
                d="M8 10l4-4 4 4"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            class="ghost icon-button bookmarks-header-icon"
            onClick={() => void handlePushDeleted()}
            disabled={isBusy()}
            aria-label="Push deleted bookmarks"
            title="Push deleted bookmarks"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M7 6h10M10 6V4h4v2"
                stroke="currentColor"
                stroke-width="1.4"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <path
                d="M9 10v6M15 10v6"
                stroke="currentColor"
                stroke-width="1.4"
                stroke-linecap="round"
              />
              <path
                d="M8 6l1 14h6l1-14"
                stroke="currentColor"
                stroke-width="1.4"
                stroke-linejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            class="ghost icon-button bookmarks-header-action"
            onClick={props.onEditBase}
            aria-label="Edit divergence base"
            title="Edit base"
          >
            Base…
          </button>
          <button
            type="button"
            class="ghost icon-button bookmarks-header-icon"
            onClick={props.onRefresh}
            disabled={props.isLoading}
            aria-label="Refresh bookmarks"
            title="Refresh"
          >
            ↻
          </button>
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
        <button
          type="button"
          class="bookmarks-base-apply"
          onClick={handleApplyCustomBase}
          disabled={!state.customBase.trim() || isBusy()}
        >
          Set
        </button>
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
          <button
            type="button"
            class="ghost icon-button bookmarks-revisions-refresh"
            onClick={props.onRefreshRecent}
            disabled={props.recentIsLoading}
            aria-label="Refresh recent revisions"
            title="Refresh"
          >
            ↻
          </button>
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
                      <button
                        type="button"
                        class="ghost icon-button bookmarks-row-action"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handlePushBookmark(bookmark);
                        }}
                        disabled={isBusy()}
                        aria-label={`Push bookmark ${bookmark.name}`}
                        title="Push bookmark"
                      >
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                          <path
                            d="M12 17V7"
                            stroke="currentColor"
                            stroke-width="1.6"
                            stroke-linecap="round"
                          />
                          <path
                            d="M8 10l4-4 4 4"
                            stroke="currentColor"
                            stroke-width="1.6"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          />
                        </svg>
                      </button>
                      <button
                        type="button"
                        class="ghost icon-button bookmarks-row-action"
                        onClick={(event) => {
                          event.stopPropagation();
                          props.onRenameBookmark(bookmark);
                        }}
                        disabled={isBusy()}
                        aria-label={`Rename bookmark ${bookmark.name}`}
                        title="Rename bookmark"
                      >
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                          <path
                            d="M4 20h4l10.5-10.5a2.12 2.12 0 0 0 0-3L16.5 4.5a2.12 2.12 0 0 0-3 0L3 15v5Z"
                            stroke="currentColor"
                            stroke-width="1.4"
                            stroke-linejoin="round"
                          />
                          <path
                            d="M13.5 5.5l5 5"
                            stroke="currentColor"
                            stroke-width="1.4"
                            stroke-linecap="round"
                          />
                          <path
                            d="M14 20h6"
                            stroke="currentColor"
                            stroke-width="1.4"
                            stroke-linecap="round"
                          />
                        </svg>
                      </button>
                      <button
                        type="button"
                        class="ghost icon-button bookmarks-row-action"
                        onClick={(event) => {
                          event.stopPropagation();
                          props.onMoveBookmark(bookmark);
                        }}
                        disabled={isBusy()}
                        aria-label={`Move bookmark ${bookmark.name}`}
                        title="Move bookmark"
                      >
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                          <path
                            d="M4 20h4l10.5-10.5a2.12 2.12 0 0 0 0-3L16.5 4.5a2.12 2.12 0 0 0-3 0L3 15v5Z"
                            stroke="currentColor"
                            stroke-width="1.4"
                            stroke-linejoin="round"
                          />
                          <path
                            d="M13.5 5.5l5 5"
                            stroke="currentColor"
                            stroke-width="1.4"
                            stroke-linecap="round"
                          />
                        </svg>
                      </button>
                      <button
                        type="button"
                        class="ghost icon-button bookmarks-row-action destructive"
                        onClick={(event) => {
                          event.stopPropagation();
                          props.onDeleteBookmark(bookmark);
                        }}
                        disabled={isBusy()}
                        aria-label={`Delete bookmark ${bookmark.name}`}
                        title="Delete bookmark"
                      >
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                          <path
                            d="M4 7h16"
                            stroke="currentColor"
                            stroke-width="1.4"
                            stroke-linecap="round"
                          />
                          <path
                            d="M10 11v6M14 11v6"
                            stroke="currentColor"
                            stroke-width="1.4"
                            stroke-linecap="round"
                          />
                          <path
                            d="M6 7l1 13h10l1-13"
                            stroke="currentColor"
                            stroke-width="1.4"
                            stroke-linejoin="round"
                          />
                          <path
                            d="M9 7V4h6v3"
                            stroke="currentColor"
                            stroke-width="1.4"
                            stroke-linejoin="round"
                          />
                        </svg>
                      </button>
                    </Show>
                    <Show when={bookmark.kind === "remote"}>
                      <button
                        type="button"
                        class="ghost icon-button bookmarks-row-action"
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
                      >
                        <Show
                          when={bookmark.tracked}
                          fallback={
                            <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                              <path
                                d="M12 8v8"
                                stroke="currentColor"
                                stroke-width="1.6"
                                stroke-linecap="round"
                              />
                              <path
                                d="M8 12h8"
                                stroke="currentColor"
                                stroke-width="1.6"
                                stroke-linecap="round"
                              />
                            </svg>
                          }
                        >
                          <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                            <path
                              d="M8 12h8"
                              stroke="currentColor"
                              stroke-width="1.6"
                              stroke-linecap="round"
                            />
                          </svg>
                        </Show>
                      </button>
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
