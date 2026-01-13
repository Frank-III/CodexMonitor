import { Show } from "solid-js";
import { createStore } from "solid-js/store";

type ConfirmPromptProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  confirmVariant?: "primary" | "destructive";
  onClose: () => void;
  onConfirm: () => Promise<void>;
};

export function ConfirmPrompt(props: ConfirmPromptProps) {
  return (
    <Show when={props.open}>
      <ConfirmPromptContent {...props} />
    </Show>
  );
}

function ConfirmPromptContent(props: ConfirmPromptProps) {
  const [state, setState] = createStore<{
    isConfirming: boolean;
    error: string | null;
  }>({
    isConfirming: false,
    error: null,
  });

  const handleConfirm = async () => {
    if (state.isConfirming) {
      return;
    }
    setState({ isConfirming: true, error: null });
    try {
      await props.onConfirm();
      props.onClose();
    } catch (err) {
      setState({
        error: err instanceof Error ? err.message : String(err),
        isConfirming: false,
      });
    }
  };

  const confirmClass = () => {
    if (props.confirmVariant === "destructive") {
      return "ghost confirm-destructive";
    }
    return "primary";
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
            aria-label="Close confirmation"
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
          <div class="whitespace-pre-wrap break-words">{props.message}</div>
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
            disabled={state.isConfirming}
          >
            Cancel
          </button>
          <button
            type="button"
            class={confirmClass()}
            onClick={handleConfirm}
            disabled={state.isConfirming}
          >
            {state.isConfirming ? "Working…" : props.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
