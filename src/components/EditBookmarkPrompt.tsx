import { Show } from "solid-js";
import { createStore } from "solid-js/store";

type EditBookmarkPromptProps = {
  open: boolean;
  title: string;
  workspaceName: string | null;
  name: string;
  targetRevset: string;
  nameReadOnly?: boolean;
  onClose: () => void;
  onSave: (name: string, targetRevset: string) => Promise<void>;
};

export function EditBookmarkPrompt(props: EditBookmarkPromptProps) {
  return (
    <Show when={props.open}>
      <EditBookmarkPromptContent {...props} />
    </Show>
  );
}

function EditBookmarkPromptContent(props: EditBookmarkPromptProps) {
  const [state, setState] = createStore<{
    name: string;
    targetRevset: string;
    isSaving: boolean;
    error: string | null;
  }>({
    name: props.name,
    targetRevset: props.targetRevset,
    isSaving: false,
    error: null,
  });

  const handleSave = async () => {
    if (state.isSaving) {
      return;
    }
    const trimmedName = state.name.trim();
    if (!trimmedName) {
      setState("error", "Bookmark name is required.");
      return;
    }
    const trimmedRevset = state.targetRevset.trim();
    if (!trimmedRevset) {
      setState("error", "Target revset is required.");
      return;
    }
    setState({ isSaving: true, error: null });
    try {
      await props.onSave(trimmedName, trimmedRevset);
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
              {props.title}
            </div>
            <button
              type="button"
              class="ghost icon-button"
              onClick={props.onClose}
              aria-label="Close bookmark prompt"
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
                <label class="text-[11px] text-white/70" for="bookmark-name">
                  Bookmark name
                </label>
                <input
                  id="bookmark-name"
                  class="rounded-[10px] border border-white/15 bg-white/5 px-[10px] py-[8px] text-[13px] text-white/90 outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-400/20 disabled:opacity-60"
                  type="text"
                  value={state.name}
                  placeholder="e.g. main, trunk, fix-ui"
                  disabled={props.nameReadOnly}
                  onInput={(event) => setState("name", event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleSave();
                    }
                  }}
                  spellcheck={false}
                />
              </div>

              <div class="flex flex-col gap-[6px]">
                <label class="text-[11px] text-white/70" for="bookmark-revset">
                  Target revset (jj)
                </label>
                <input
                  id="bookmark-revset"
                  class="rounded-[10px] border border-white/15 bg-white/5 px-[10px] py-[8px] font-mono text-[12px] text-white/90 outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-400/20"
                  type="text"
                  value={state.targetRevset}
                  placeholder="@"
                  onInput={(event) => setState("targetRevset", event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleSave();
                    }
                  }}
                  spellcheck={false}
                />
                <div class="text-[11px] leading-snug text-white/50">
                  Examples: <code>@</code>, <code>@-</code>, <code>trunk()</code>,{" "}
                  <code>main</code>, <code>main@origin</code>,{" "}
                  <code>latest(bookmarks(main))</code>.
                </div>
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
              onClick={handleSave}
              disabled={state.isSaving}
            >
              {state.isSaving ? "Saving…" : "Save"}
            </button>
          </div>
      </div>
    </div>
  );
}
