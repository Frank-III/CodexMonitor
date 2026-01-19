import { Dialog as KobalteDialog } from "@kobalte/core/dialog";
import { Show } from "solid-js";
import { createStore } from "solid-js/store";
import type { VcsLogEntry, WorktreeMode, WorkspaceInfo } from "../types";
import { Button, Dialog, IconButton, List, Select, TextField } from "../ui";

type WorktreePromptProps = {
  open: boolean;
  workspace: WorkspaceInfo | null;
  logEntries: VcsLogEntry[];
  logIsLoading: boolean;
  logError: string | null;
  onRefreshLog: () => void;
  onClose: () => void;
  onCreate: (name: string, mode: WorktreeMode, baseRevset: string | null) => Promise<void>;
};

export function WorktreePrompt(props: WorktreePromptProps) {
  return (
    <Show when={props.open}>
      <WorktreePromptContent {...props} />
    </Show>
  );
}

function WorktreePromptContent(props: WorktreePromptProps) {
  const [state, setState] = createStore<{
    name: string;
    mode: WorktreeMode;
    baseRevset: string;
    baseRevsetDirty: boolean;
    isCreating: boolean;
    error: string | null;
  }>({
    name: "",
    mode: "fork",
    baseRevset: "@-",
    baseRevsetDirty: false,
    isCreating: false,
    error: null,
  });

  const formatTimestamp = (unixSeconds: number) => {
    const date = new Date(unixSeconds * 1000);
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleCreate = async () => {
    if (state.isCreating) {
      return;
    }
    const trimmed = state.name.trim();
    if (!trimmed) {
      setState("error", "Name is required.");
      return;
    }
    setState({ isCreating: true, error: null });
    try {
      const revset = state.baseRevset.trim();
      await props.onCreate(trimmed, state.mode, revset ? revset : null);
      props.onClose();
    } catch (err) {
      setState({
        error: err instanceof Error ? err.message : String(err),
        isCreating: false,
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
        <Dialog title="New worktree agent">
          <div class="flex flex-col gap-4 px-6 pb-6">
            <Show when={props.workspace}>
              {(ws) => (
                <div class="text-13-regular text-text-weak">
                  Base workspace: <span class="text-text-strong">{ws().name}</span>
                </div>
              )}
            </Show>

            <TextField
              label="Agent name"
              value={state.name}
              onChange={(value) => setState("name", value)}
              placeholder="e.g. fix-ui, refactor, experiment"
              spellcheck={false}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleCreate();
                }
              }}
              autofocus
            />

            <div class="flex flex-col gap-2">
              <div class="text-12-medium text-text-weak">Mode</div>
              <Select<WorktreeMode>
                size="large"
                variant="secondary"
                options={["fork", "stack"]}
                current={state.mode}
                label={(value) => (value === "stack" ? "Stack (from @)" : "Fork (same base)")}
                onSelect={(next) => {
                  if (!next) return;
                  setState("mode", next);
                  if (!state.baseRevsetDirty) {
                    setState("baseRevset", next === "stack" ? "@" : "@-");
                  }
                }}
              />
              <div class="text-12-regular text-text-weak">
                Fork starts from the same parent commits. Stack starts from the current working copy{" "}
                (<code class="font-mono">@</code>).
              </div>
            </div>

            <TextField
              label="Base revset (jj)"
              value={state.baseRevset}
              onChange={(value) => {
                setState("baseRevsetDirty", true);
                setState("baseRevset", value);
              }}
              placeholder={state.mode === "stack" ? "@" : "@-"}
              spellcheck={false}
              class="font-mono"
              description={`Optional revset used for the starting revision and future sync base. Leave blank for the default (${state.mode === "stack" ? "@" : "@-"}).`}
            />

            <Show when={props.workspace}>
              {(ws) => (
                <div class="flex flex-col gap-2">
                  <div class="flex items-center justify-between gap-2">
                    <div class="text-12-medium text-text-weak">
                      Pick a base from <span class="text-text-strong">{ws().name}</span>
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
                    <div class="max-h-[240px] overflow-hidden rounded-md border border-border-weaker-base bg-surface-base">
                      <List<VcsLogEntry>
                        emptyMessage={props.logIsLoading ? "Loading revisions…" : "No revisions found."}
                        key={(entry) => entry.sha}
                        items={() => props.logEntries.slice(0, 20)}
                        current={props.logEntries.find((entry) => entry.sha === state.baseRevset.trim())}
                        onSelect={(entry) => {
                          if (!entry) return;
                          setState("baseRevsetDirty", true);
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
              )}
            </Show>

            <Show when={state.error}>
              {(error) => (
                <div class="rounded-md bg-surface-critical-weak px-3 py-2 text-13-regular text-text-on-critical-weak">
                  {error()}
                </div>
              )}
            </Show>

            <div class="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={props.onClose} disabled={state.isCreating}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleCreate}
                disabled={state.isCreating || !props.workspace}
              >
                {state.isCreating ? "Creating…" : "Create"}
              </Button>
            </div>
          </div>
        </Dialog>
      </KobalteDialog.Portal>
    </KobalteDialog>
  );
}
