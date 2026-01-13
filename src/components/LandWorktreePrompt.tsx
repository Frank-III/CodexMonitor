import { Show } from "solid-js";
import { createStore } from "solid-js/store";
import type { WorkspaceInfo } from "../types";

type LandWorktreePromptProps = {
  open: boolean;
  worktree: WorkspaceInfo | null;
  destination: WorkspaceInfo | null;
  onClose: () => void;
  onLand: () => Promise<void>;
};

export function LandWorktreePrompt(props: LandWorktreePromptProps) {
  return (
    <Show when={props.open}>
      <LandWorktreePromptContent {...props} />
    </Show>
  );
}

function LandWorktreePromptContent(props: LandWorktreePromptProps) {
  const [state, setState] = createStore<{
    isLanding: boolean;
    error: string | null;
  }>({
    isLanding: false,
    error: null,
  });

  const handleLand = async () => {
    if (state.isLanding) {
      return;
    }
    setState({ isLanding: true, error: null });
    try {
      await props.onLand();
      props.onClose();
    } catch (err) {
      setState({
        error: err instanceof Error ? err.message : String(err),
        isLanding: false,
      });
    }
  };

  const canLand = () =>
    !!props.worktree && !!props.destination && !state.isLanding;

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
            Land Worktree
          </div>
          <button
            type="button"
            class="ghost icon-button"
            onClick={props.onClose}
            aria-label="Close land prompt"
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
	          <Show when={props.worktree && props.destination}>
	            <div class="mb-[10px]">
	              This will squash changes from{" "}
	              <span class="font-semibold text-white/85">{props.worktree?.name ?? ""}</span>{" "}
	              into{" "}
	              <span class="font-semibold text-white/85">
	                {props.destination?.name ?? ""}
	              </span>{" "}
	              and then delete the worktree agent directory.
	            </div>
	          </Show>

          <div class="rounded-[12px] border border-white/10 bg-white/5 p-[10px] text-[11px] text-white/60">
            Uses <code class="text-white/80">jj squash</code> into the destination workspace’s{" "}
            <code class="text-white/80">@</code>. If there are conflicts, they’ll appear in the
            destination workspace.
          </div>

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
            disabled={state.isLanding}
          >
            Cancel
          </button>
          <button
            type="button"
            class="primary"
            onClick={handleLand}
            disabled={!canLand()}
          >
            {state.isLanding ? "Landing…" : "Land and Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
