import { For, Show, createMemo } from "solid-js";
import { createStore } from "solid-js/store";
import type { WorkspaceInfo } from "../types";

type ReparentWorktreePromptProps = {
  open: boolean;
  worktree: WorkspaceInfo | null;
  bases: WorkspaceInfo[];
  descendantCount: number;
  onClose: () => void;
  onReparent: (options: { baseId: string; baseRevset: string; restack: boolean }) => Promise<void>;
};

export function ReparentWorktreePrompt(props: ReparentWorktreePromptProps) {
  return (
    <Show when={props.open}>
      <ReparentWorktreePromptContent {...props} />
    </Show>
  );
}

function defaultRevsetForBase(base: WorkspaceInfo | null): string {
  if (!base) {
    return "@-";
  }
  return base.kind === "worktree" ? "@" : "@-";
}

function ReparentWorktreePromptContent(props: ReparentWorktreePromptProps) {
  const initialBaseId = createMemo(() => {
    const current = props.worktree?.base_id ?? props.worktree?.parent_id ?? null;
    if (current && props.bases.some((entry) => entry.id === current)) {
      return current;
    }
    return props.bases[0]?.id ?? "";
  });

  const initialBase = createMemo(() => props.bases.find((entry) => entry.id === initialBaseId()) ?? null);

  const [state, setState] = createStore<{
    baseId: string;
    baseRevset: string;
    baseRevsetDirty: boolean;
    restack: boolean;
    isSaving: boolean;
    error: string | null;
  }>({
    baseId: initialBaseId(),
    baseRevset: defaultRevsetForBase(initialBase()),
    baseRevsetDirty: false,
    restack: props.descendantCount > 0,
    isSaving: false,
    error: null,
  });

  const selectedBase = createMemo(() => props.bases.find((entry) => entry.id === state.baseId) ?? null);
  const currentBaseId = () => props.worktree?.base_id ?? props.worktree?.parent_id ?? null;
  const trimmedRevset = () => state.baseRevset.trim();
  const isNoop = () =>
    !!props.worktree &&
    !!currentBaseId() &&
    currentBaseId() === state.baseId &&
    (props.worktree.base_revset ?? "").trim() === trimmedRevset();

  const canSave = () =>
    !!props.worktree &&
    !!state.baseId &&
    trimmedRevset().length > 0 &&
    props.bases.some((entry) => entry.id === state.baseId) &&
    !state.isSaving &&
    !isNoop();

  const handleBaseChange = (nextId: string) => {
    setState({ baseId: nextId });
    if (!state.baseRevsetDirty) {
      const base = props.bases.find((entry) => entry.id === nextId) ?? null;
      setState({ baseRevset: defaultRevsetForBase(base) });
    }
  };

  const handleReparent = async () => {
    if (!canSave()) {
      return;
    }

    setState({ isSaving: true, error: null });
    try {
      await props.onReparent({
        baseId: state.baseId,
        baseRevset: trimmedRevset(),
        restack: state.restack,
      });
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
        class="w-[calc(100vw-40px)] max-w-[640px] max-h-[calc(100vh-80px)] overflow-auto rounded-[14px] border border-white/10 bg-[rgba(18,22,32,0.98)] p-[14px] shadow-[0_18px_36px_rgba(0,0,0,0.35)]"
        role="dialog"
        aria-modal="true"
      >
        <div class="mb-[10px] flex items-center justify-between gap-3">
          <div class="text-[12px] font-bold uppercase tracking-[0.1em] text-white/70">
            Reparent Worktree
          </div>
          <button
            type="button"
            class="ghost icon-button"
            onClick={props.onClose}
            aria-label="Close reparent prompt"
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
          <Show when={props.worktree} fallback={<div>Select a worktree to reparent.</div>}>
            {(worktree) => (
              <>
                <div class="mb-[10px]">
                  Moves{" "}
                  <span class="font-semibold text-white/85">{worktree().name}</span>{" "}
                  onto a new base workspace by running{" "}
                  <code class="text-white/80">jj rebase -b @ -o &lt;base&gt;</code>.
                </div>

                <div class="grid gap-[10px]">
                  <label class="grid gap-[6px]">
                    <span class="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/50">
                      Base workspace
                    </span>
                    <select
                      class="w-full rounded-[10px] border border-white/10 bg-white/5 px-[10px] py-[8px] text-[12px] text-white/85 outline-none focus:border-white/20"
                      value={state.baseId}
                      onChange={(event) => handleBaseChange(event.currentTarget.value)}
                      disabled={state.isSaving}
                    >
                      <For each={props.bases}>
                        {(base) => (
                          <option value={base.id}>
                            {base.kind === "main" ? `Main: ${base.name}` : `Worktree: ${base.name}`}
                          </option>
                        )}
                      </For>
                    </select>
                    <Show when={!props.bases.length}>
                      <div class="text-[11px] text-red-200/80">
                        No valid bases found (cannot reparent onto itself or descendants).
                      </div>
                    </Show>
                  </label>

                  <label class="grid gap-[6px]">
                    <span class="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/50">
                      Base revset
                    </span>
                    <input
                      class="w-full rounded-[10px] border border-white/10 bg-white/5 px-[10px] py-[8px] font-mono text-[12px] text-white/85 outline-none focus:border-white/20"
                      value={state.baseRevset}
                      onInput={(event) => {
                        setState({
                          baseRevset: event.currentTarget.value,
                          baseRevsetDirty: true,
                        });
                      }}
                      placeholder={defaultRevsetForBase(selectedBase())}
                      disabled={state.isSaving}
                      spellcheck={false}
                    />
                    <div class="text-[11px] text-white/55">
                      Use <code class="text-white/80">@</code> for base working copy,{" "}
                      <code class="text-white/80">@-</code> for the base commit, or{" "}
                      <code class="text-white/80">trunk()</code> on main.
                    </div>
                  </label>

                  <label class="flex items-start gap-[8px] rounded-[12px] border border-white/10 bg-white/5 p-[10px] text-[11px] text-white/60">
                    <input
                      type="checkbox"
                      class="mt-[2px]"
                      checked={state.restack}
                      disabled={state.isSaving || props.descendantCount === 0}
                      onChange={(event) => setState({ restack: event.currentTarget.checked })}
                    />
                    <div class="flex flex-col gap-[4px]">
                      <span class="font-semibold text-white/75">Restack downstream worktrees</span>
                      <Show
                        when={props.descendantCount > 0}
                        fallback={<span>No downstream worktrees found.</span>}
                      >
                        <span>
                          Rebase {props.descendantCount} downstream worktree(s) onto the updated base chain.
                        </span>
                      </Show>
                    </div>
                  </label>
                </div>

                <Show when={isNoop()}>
                  <div class="mt-[12px] rounded-[10px] border border-white/10 bg-white/5 p-[10px] text-[11px] text-white/60">
                    No changes selected.
                  </div>
                </Show>

                <Show when={state.error}>
                  <div class="mt-[12px] whitespace-pre-wrap break-words rounded-[10px] border border-red-300/20 bg-red-300/10 p-[10px] text-[12px] text-red-200">
                    {state.error}
                  </div>
                </Show>
              </>
            )}
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
            onClick={handleReparent}
            disabled={!canSave()}
          >
            {state.isSaving ? "Reparenting…" : "Reparent"}
          </button>
        </div>
      </div>
    </div>
  );
}

