import { Dialog as KobalteDialog } from "@kobalte/core/dialog";
import { Show } from "solid-js";
import { createStore } from "solid-js/store";
import { Button, Dialog, TextField } from "../ui";

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
        <Dialog title={props.title}>
          <div class="flex flex-col gap-4 px-6 pb-6">
            <Show when={props.workspaceName}>
              {(workspaceName) => (
                <div class="text-13-regular text-text-weak">
                  Workspace: <span class="text-text-strong">{workspaceName()}</span>
                </div>
              )}
            </Show>

            <TextField
              label="Bookmark name"
              value={state.name}
              onChange={(value) => setState("name", value)}
              placeholder="e.g. main, trunk, fix-ui"
              readOnly={props.nameReadOnly}
              spellcheck={false}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleSave();
                }
              }}
              autofocus
            />

            <TextField
              label="Target revset (jj)"
              value={state.targetRevset}
              onChange={(value) => setState("targetRevset", value)}
              placeholder="@"
              spellcheck={false}
              class="font-mono"
              description="Examples: @, @-, trunk(), main, main@origin, latest(bookmarks(main))."
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleSave();
                }
              }}
            />

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
              <Button variant="primary" onClick={handleSave} disabled={state.isSaving}>
                {state.isSaving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </Dialog>
      </KobalteDialog.Portal>
    </KobalteDialog>
  );
}
