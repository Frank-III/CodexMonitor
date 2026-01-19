import { Dialog as KobalteDialog } from "@kobalte/core/dialog";
import { Show } from "solid-js";
import { createStore } from "solid-js/store";
import type { VcsLogEntry, WorkspaceInfo } from "../types";
import { Button, Dialog, IconButton, List, TextField } from "../ui";

type EditWorktreeBasePromptProps = {
  open: boolean;
  worktree: WorkspaceInfo | null;
  destination: WorkspaceInfo | null;
  logEntries: VcsLogEntry[];
  logIsLoading: boolean;
  logError: string | null;
  onRefreshLog: () => void;
  onClose: () => void;
  onSave: (baseRevset: string) => Promise<void>;
};

export function EditWorktreeBasePrompt(props: EditWorktreeBasePromptProps) {
  return (
    <Show when={props.open}>
      <EditWorktreeBasePromptContent {...props} />
    </Show>
  );
}

function EditWorktreeBasePromptContent(props: EditWorktreeBasePromptProps) {
  const [state, setState] = createStore<{
    baseRevset: string;
    isSaving: boolean;
    error: string | null;
  }>({
    baseRevset: props.worktree?.base_revset ?? "@-",
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
    return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
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
        <Dialog title="Base revset">
          <div class="flex flex-col gap-4 px-6 pb-6">
            <Show when={props.worktree && props.destination}>
              <div class="text-13-regular text-text-weak">
                Worktree <span class="text-text-strong">{props.worktree?.name ?? ""}</span> syncs
                against <span class="text-text-strong">{props.destination?.name ?? ""}</span>.
              </div>
            </Show>

            <TextField
              label="JJ revset"
              value={state.baseRevset}
              onChange={(value) => setState("baseRevset", value)}
              placeholder="@-"
              spellcheck={false}
              class="font-mono"
              description="Examples: @, @-, trunk(), heads(main)."
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleSave();
                }
              }}
              autofocus
            />

            <Show when={props.destination}>
              <div class="flex flex-col gap-2">
                <div class="flex items-center justify-between gap-2">
                  <div class="text-12-medium text-text-weak">
                    Pick a base from <span class="text-text-strong">{props.destination!.name}</span>
                  </div>
                  <IconButton
                    type="button"
                    icon="refresh"
                    variant="ghost"
                    onClick={props.onRefreshLog}
                    disabled={props.logIsLoading}
                    aria-label="Refresh revision list"
                    title="Refresh"
                  />
                </div>

                <Show when={props.logError}>
                  {(error) => (
                    <div class="rounded-md bg-surface-critical-weak px-3 py-2 text-13-regular text-text-on-critical-weak">
                      {error()}
                    </div>
                  )}
                </Show>

                <Show when={!props.logError}>
                  <div class="h-[240px] overflow-hidden rounded-md border border-border-weaker-base bg-surface-base">
                    <List<VcsLogEntry>
                      class="h-full"
                      emptyMessage={props.logIsLoading ? "Loading revisions…" : "No revisions found."}
                      key={(entry) => entry.sha}
                      items={() => props.logEntries.slice(0, 20)}
                      current={props.logEntries.find((entry) => entry.sha === state.baseRevset.trim())}
                      onSelect={(entry) => {
                        if (!entry) return;
                        setState("baseRevset", entry.sha);
                      }}
                    >
                      {(entry) => (
                        <div class="w-full flex items-start justify-between gap-3 text-13-regular">
                          <div class="min-w-0">
                            <div class="truncate text-text-strong">{entry.summary || "(no description)"}</div>
                            <div class="mt-0.5 truncate text-12-regular text-text-weak">
                              {entry.author} · {formatTimestamp(entry.timestamp)}
                            </div>
                          </div>
                          <code class="shrink-0 text-12-regular text-text-weak font-mono">
                            {entry.sha.slice(0, 10)}
                          </code>
                        </div>
                      )}
                    </List>
                  </div>
                  <div class="text-12-regular text-text-weak">
                    Clicking a revision sets the revset to its full commit id.
                  </div>
                </Show>
              </div>
            </Show>

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
              <Button variant="primary" onClick={handleSave} disabled={state.isSaving || !props.worktree}>
                {state.isSaving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </Dialog>
      </KobalteDialog.Portal>
    </KobalteDialog>
  );
}
