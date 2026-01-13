import { Show } from "solid-js";
import { createStore } from "solid-js/store";

type RenameBookmarkPromptProps = {
  open: boolean;
  workspaceName: string | null;
  oldName: string;
  onClose: () => void;
  onRename: (newName: string) => Promise<void>;
};

export function RenameBookmarkPrompt(props: RenameBookmarkPromptProps) {
  return (
    <Show when={props.open}>
      <RenameBookmarkPromptContent {...props} />
    </Show>
  );
}

function RenameBookmarkPromptContent(props: RenameBookmarkPromptProps) {
  const [state, setState] = createStore<{
    newName: string;
    isSaving: boolean;
    error: string | null;
  }>({
    newName: props.oldName,
    isSaving: false,
    error: null,
  });

  const handleRename = async () => {
    if (state.isSaving) {
      return;
    }
    const trimmed = state.newName.trim();
    if (!trimmed) {
      setState("error", "New bookmark name is required.");
      return;
    }
    if (trimmed === props.oldName.trim()) {
      props.onClose();
      return;
    }
    setState({ isSaving: true, error: null });
    try {
      await props.onRename(trimmed);
      props.onClose();
    } catch (err) {
      setState({
        error: err instanceof Error ? err.message : String(err),
        isSaving: false,
      });
    }
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
        class="w-[calc(100vw-40px)] max-w-[520px] max-h-[calc(100vh-80px)] overflow-auto rounded-[14px] border border-white/10 bg-[rgba(18,22,32,0.98)] p-[14px] shadow-[0_18px_36px_rgba(0,0,0,0.35)]"
        role="dialog"
        aria-modal="true"
      >
          <div class="mb-[10px] flex items-center justify-between gap-3">
            <div class="text-[12px] font-bold uppercase tracking-[0.1em] text-white/70">
              Rename Bookmark
            </div>
            <button
              type="button"
              class="ghost icon-button"
              onClick={props.onClose}
              aria-label="Close rename bookmark prompt"
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
            <Show when={props.workspaceName}>
              {(wsName) => (
                <div class="mb-[10px] text-[12px] text-white/55">
                  Workspace:{" "}
                  <span class="font-semibold text-white/75">{wsName()}</span>
                </div>
              )}
            </Show>

            <div class="flex flex-col gap-[14px]">
              <div class="flex flex-col gap-[6px]">
                <label class="text-[11px] text-white/70" for="bookmark-old-name">
                  Current name
                </label>
                <input
                  id="bookmark-old-name"
                  class="rounded-[10px] border border-white/10 bg-white/5 px-[10px] py-[8px] text-[13px] text-white/75 opacity-70"
                  type="text"
                  value={props.oldName}
                  disabled
                />
              </div>

              <div class="flex flex-col gap-[6px]">
                <label class="text-[11px] text-white/70" for="bookmark-new-name">
                  New name
                </label>
                <input
                  id="bookmark-new-name"
                  class="rounded-[10px] border border-white/15 bg-white/5 px-[10px] py-[8px] text-[13px] text-white/90 outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-400/20"
                  type="text"
                  value={state.newName}
                  placeholder="e.g. main, trunk, fix-ui"
                  onInput={(event) => setState("newName", event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleRename();
                    }
                  }}
                  spellcheck={false}
                />
              </div>

              <div class="text-[11px] leading-snug text-white/50">
                This renames the <span class="font-semibold text-white/70">local</span>{" "}
                bookmark only. Use <code>jj git push</code> to update a remote.
              </div>

              <Show when={state.error}>
                <div class="whitespace-pre-wrap break-words rounded-[10px] border border-red-300/20 bg-red-300/10 p-[10px] text-[12px] text-red-200">
                  {state.error}
                </div>
              </Show>
            </div>
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
              onClick={handleRename}
              disabled={state.isSaving}
            >
              {state.isSaving ? "Renaming…" : "Rename"}
            </button>
          </div>
      </div>
    </div>
  );
}
