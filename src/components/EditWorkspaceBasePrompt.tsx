import { For, Show } from "solid-js";
import { createStore } from "solid-js/store";
import type { VcsLogEntry, WorkspaceInfo } from "../types";

type EditWorkspaceBasePromptProps = {
  open: boolean;
  workspace: WorkspaceInfo | null;
  logEntries: VcsLogEntry[];
  logIsLoading: boolean;
  logError: string | null;
  onRefreshLog: () => void;
  onClose: () => void;
  onSave: (baseRevset: string) => Promise<void>;
};

export function EditWorkspaceBasePrompt(props: EditWorkspaceBasePromptProps) {
  return (
    <Show when={props.open}>
      <EditWorkspaceBasePromptContent {...props} />
    </Show>
  );
}

function EditWorkspaceBasePromptContent(props: EditWorkspaceBasePromptProps) {
  const [state, setState] = createStore<{
    baseRevset: string;
    isSaving: boolean;
    error: string | null;
  }>({
    baseRevset: props.workspace?.base_revset ?? "trunk()",
    isSaving: false,
    error: null,
  });

  const handleSave = async () => {
    if (state.isSaving) {
      return;
    }
    const trimmed = state.baseRevset.trim();
    if (!trimmed) {
      setState("error", "Base revset is required.");
      return;
    }
    setState({ isSaving: true, error: null });
    try {
      await props.onSave(trimmed);
      props.onClose();
    } catch (err) {
      setState({
        error: err instanceof Error ? err.message : String(err),
        isSaving: false,
      });
    }
  };

  const formatTimestamp = (unixSeconds: number) => {
    const date = new Date(unixSeconds * 1000);
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div
      class="absolute inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.45)] backdrop-blur-[12px] backdrop-saturate-[120%] [-webkit-app-region:no-drag]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) {
          props.onClose();
        }
      }}
    >
      <div
        class="w-[calc(100vw-40px)] max-w-[560px] max-h-[calc(100vh-80px)] overflow-auto rounded-[14px] border border-white/10 bg-[rgba(18,22,32,0.98)] p-[14px] shadow-[0_18px_36px_rgba(0,0,0,0.35)]"
        role="dialog"
        aria-modal="true"
      >
          <div class="mb-[10px] flex items-center justify-between gap-3">
            <div class="text-[12px] font-bold uppercase tracking-[0.1em] text-white/70">
              Divergence Base
            </div>
            <button
              type="button"
              class="ghost icon-button"
              onClick={props.onClose}
              aria-label="Close base revset prompt"
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linecap="round"
                />
              </svg>
            </button>
          </div>

          <div class="px-[2px] pb-[10px] pt-[6px] text-[12px] leading-relaxed text-white/70">
            <Show when={props.workspace}>
              {(ws) => (
                <div class="mb-[10px]">
                  Workspace{" "}
                  <span class="font-semibold text-white/85">{ws().name}</span>{" "}
                  compares against this base when showing{" "}
                  <span class="font-semibold text-white/85">+ahead / -behind</span>.
                </div>
              )}
            </Show>

            <div class="flex flex-col gap-[6px]">
              <label class="text-[11px] text-white/70" for="workspace-base-revset">
                JJ revset
              </label>
              <input
                id="workspace-base-revset"
                class="rounded-[10px] border border-white/15 bg-white/5 px-[10px] py-[8px] font-mono text-[12px] text-white/90 outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-400/20"
                type="text"
                value={state.baseRevset}
                placeholder="trunk()"
                onInput={(event) => setState("baseRevset", event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleSave();
                  }
                }}
                spellcheck={false}
              />
              <div class="text-[11px] leading-snug text-white/50">
                Examples: <code>trunk()</code>, <code>@-</code>, <code>heads(main)</code>,{" "}
                <code>latest(bookmarks(main))</code>.
              </div>
            </div>

            <div class="mt-[14px] flex items-center justify-between gap-3">
              <div class="text-[11px] font-semibold text-white/70">
                Pick a base revision
              </div>
              <button
                type="button"
                class="ghost icon-button"
                onClick={props.onRefreshLog}
                disabled={props.logIsLoading}
                aria-label="Refresh revision list"
                title="Refresh"
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M20 12a8 8 0 1 1-2.34-5.66M20 4v6h-6"
                    stroke="currentColor"
                    stroke-width="1.4"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>
            </div>

            <Show when={props.logError}>
              <div class="mt-[10px] whitespace-pre-wrap break-words rounded-[10px] border border-red-300/20 bg-red-300/10 p-[10px] text-[12px] text-red-200">
                {props.logError}
              </div>
            </Show>

            <Show when={!props.logError}>
              <div class="mt-[8px] max-h-[220px] overflow-auto rounded-[12px] border border-white/10 bg-white/5 p-[6px]">
                <Show
                  when={!props.logIsLoading && props.logEntries.length > 0}
                  fallback={
                    <div class="px-[10px] py-[12px] text-[11px] text-white/50">
                      {props.logIsLoading
                        ? "Loading revisions…"
                        : "No revisions found."}
                    </div>
                  }
                >
                  <div class="flex flex-col gap-[4px]">
                    <For each={props.logEntries.slice(0, 20)}>
                      {(entry) => {
                        const isSelected = () =>
                          state.baseRevset.trim() === entry.sha;
                        return (
                          <button
                            type="button"
                            class="w-full rounded-[10px] border border-transparent bg-transparent px-[10px] py-[8px] text-left transition hover:border-white/10 hover:bg-white/5"
                            classList={{ "border-indigo-400/40 bg-indigo-400/10": isSelected() }}
                            onClick={() => setState("baseRevset", entry.sha)}
                          >
                            <div class="flex items-start justify-between gap-[12px]">
                              <div class="min-w-0">
                                <div class="truncate text-[12px] font-semibold text-white/85">
                                  {entry.summary || "(no description)"}
                                </div>
                                <div class="mt-[2px] truncate text-[10px] text-white/50">
                                  {entry.author} · {formatTimestamp(entry.timestamp)}
                                </div>
                              </div>
                              <code class="text-[10px] text-white/60">
                                {entry.sha.slice(0, 10)}
                              </code>
                            </div>
                          </button>
                        );
                      }}
                    </For>
                  </div>
                </Show>
              </div>

              <div class="mt-[6px] text-[11px] leading-snug text-white/50">
                Clicking a revision sets the revset to its full commit id.
              </div>
            </Show>

            <Show when={state.error}>
              <div class="mt-[12px] whitespace-pre-wrap break-words rounded-[10px] border border-red-300/20 bg-red-300/10 p-[10px] text-[12px] text-red-200">
                {state.error}
              </div>
            </Show>
          </div>

          <div class="flex justify-end gap-[10px] border-t border-white/10 pt-[8px]">
            <button
              type="button"
              class="secondary"
              onClick={props.onClose}
              disabled={state.isSaving}
            >
              Cancel
            </button>
            <button
              type="button"
              class="primary"
              onClick={handleSave}
              disabled={state.isSaving || !props.workspace}
            >
              {state.isSaving ? "Saving…" : "Save"}
            </button>
          </div>
      </div>
    </div>
  );
}
