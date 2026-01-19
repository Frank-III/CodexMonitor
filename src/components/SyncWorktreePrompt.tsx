import { Dialog as KobalteDialog } from "@kobalte/core/dialog";
import { Show } from "solid-js";
import { createStore } from "solid-js/store";
import type { WorktreeDivergence, WorkspaceInfo } from "../types";
import { Button, Dialog } from "../ui";

type SyncWorktreePromptProps = {
  open: boolean;
  worktree: WorkspaceInfo | null;
  destination: WorkspaceInfo | null;
  divergence: WorktreeDivergence | null;
  onClose: () => void;
  onSync: () => Promise<void>;
};

export function SyncWorktreePrompt(props: SyncWorktreePromptProps) {
  return (
    <Show when={props.open}>
      <SyncWorktreePromptContent {...props} />
    </Show>
  );
}

function SyncWorktreePromptContent(props: SyncWorktreePromptProps) {
  const [state, setState] = createStore<{
    isSyncing: boolean;
    error: string | null;
  }>({
    isSyncing: false,
    error: null,
  });

  const handleSync = async () => {
    if (state.isSyncing) {
      return;
    }
    setState({ isSyncing: true, error: null });
    try {
      await props.onSync();
      props.onClose();
    } catch (err) {
      setState({
        error: err instanceof Error ? err.message : String(err),
        isSyncing: false,
      });
    }
  };

  const canSync = () =>
    !!props.worktree && !!props.destination && !state.isSyncing;
  const baseRevset = () => props.worktree?.base_revset ?? props.divergence?.base_revset ?? "@-";

  return (
    <KobalteDialog
      modal
      open={true}
      onOpenChange={(open) => {
        if (open) return;
        props.onClose();
      }}
    >
      <KobalteDialog.Portal>
        <KobalteDialog.Overlay data-component="dialog-overlay" />
        <Dialog title="Sync worktree">
          <div class="flex flex-col gap-4 px-6 pb-6 text-14-regular text-text-base">
            <Show when={props.worktree && props.destination}>
              <div>
                This will rebase <span class="text-text-strong">{props.worktree?.name ?? ""}</span>{" "}
                onto <span class="text-text-strong">{props.destination?.name ?? ""}</span> at{" "}
                <code class="font-mono text-text-base">{baseRevset()}</code>.
              </div>
            </Show>

            <Show when={props.divergence}>
              {(div) => (
                <div class="flex flex-wrap gap-3 text-13-regular text-text-weak">
                  <span>
                    Ahead: <span class="font-mono text-text-base">+{div().ahead}</span>
                  </span>
                  <span>
                    Behind: <span class="font-mono text-text-base">-{div().behind}</span>
                  </span>
                </div>
              )}
            </Show>

            <div class="rounded-md bg-surface-base px-3 py-2 text-13-regular text-text-weak">
              Uses <code class="font-mono text-text-base">jj rebase -b @ -o</code> to move the
              worktree branch onto the selected base revision.
            </div>

            <Show when={state.error}>
              {(error) => (
                <div class="rounded-md bg-surface-critical-weak px-3 py-2 text-13-regular text-text-on-critical-weak">
                  {error()}
                </div>
              )}
            </Show>

            <div class="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={props.onClose} disabled={state.isSyncing}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSync} disabled={!canSync()}>
                {state.isSyncing ? "Syncing…" : "Sync"}
              </Button>
            </div>
          </div>
        </Dialog>
      </KobalteDialog.Portal>
    </KobalteDialog>
  );
}
