import { Dialog as KobalteDialog } from "@kobalte/core/dialog";
import { Show } from "solid-js";
import { createStore } from "solid-js/store";
import { Button, Dialog, TextField } from "../ui";

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
        <Dialog title="Rename bookmark">
          <div class="flex flex-col gap-4 px-6 pb-6">
            <Show when={props.workspaceName}>
              {(workspaceName) => (
                <div class="text-13-regular text-text-weak">
                  Workspace: <span class="text-text-strong">{workspaceName()}</span>
                </div>
              )}
            </Show>

            <TextField label="Current name" value={props.oldName} disabled />

            <TextField
              label="New name"
              value={state.newName}
              onChange={(value) => setState("newName", value)}
              placeholder="e.g. main, trunk, fix-ui"
              spellcheck={false}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleRename();
                }
              }}
              autofocus
            />

            <div class="text-12-regular text-text-weak">
              This renames the <span class="text-text-strong">local</span> bookmark only. Use{" "}
              <code class="font-mono text-text-base">jj git push</code> to update a remote.
            </div>

            <Show when={state.error}>
              {(error) => (
                <div class="rounded-md bg-surface-critical-weak px-3 py-2 text-13-regular text-text-on-critical-weak">
                  {error()}
                </div>
              )}
            </Show>

            <div class="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={props.onClose} disabled={state.isSaving}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleRename} disabled={state.isSaving}>
                {state.isSaving ? "Renaming…" : "Rename"}
              </Button>
            </div>
          </div>
        </Dialog>
      </KobalteDialog.Portal>
    </KobalteDialog>
  );
}
