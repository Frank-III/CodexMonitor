import { Dialog as KobalteDialog } from "@kobalte/core/dialog";
import { Show } from "solid-js";
import { createStore } from "solid-js/store";
import { Button, Dialog } from "../ui";

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

  const confirmVariant = () => {
    if (props.confirmVariant === "destructive") {
      return "secondary" as const;
    }
    return "primary" as const;
  };

  const confirmClass = () => {
    if (props.confirmVariant === "destructive") {
      return "confirm-destructive";
    }
    return "";
  };

  return (
    <KobalteDialog
      modal
      open={true}
      onOpenChange={(open) => {
        if (open) {
          return;
        }
        props.onClose();
      }}
    >
      <KobalteDialog.Portal>
        <KobalteDialog.Overlay data-component="dialog-overlay" />
        <Dialog title={props.title}>
          <div class="flex flex-col gap-4 px-6 pb-6 text-14-regular text-text-base">
            <div class="whitespace-pre-wrap break-words">{props.message}</div>
            <Show when={state.error}>
              {(error) => (
                <div class="rounded-md bg-surface-critical-weak px-3 py-2 text-13-regular text-text-on-critical-weak">
                  {error()}
                </div>
              )}
            </Show>
            <div class="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={props.onClose} disabled={state.isConfirming}>
                Cancel
              </Button>
              <Button
                variant={confirmVariant()}
                class={confirmClass()}
                onClick={handleConfirm}
                disabled={state.isConfirming}
              >
                {state.isConfirming ? "Working…" : props.confirmLabel ?? "Confirm"}
              </Button>
            </div>
          </div>
        </Dialog>
      </KobalteDialog.Portal>
    </KobalteDialog>
  );
}
