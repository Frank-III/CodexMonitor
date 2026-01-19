import { Dialog as KobalteDialog } from "@kobalte/core/dialog";
import { createEffect, For, Show } from "solid-js";
import { createStore } from "solid-js/store";
import type { ConflictInfo, WorkspaceInfo } from "../types";
import { checkConflicts } from "../services/tauri";
import { Button, Dialog, Icon } from "../ui";

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
    isCheckingConflicts: boolean;
    conflictInfo: ConflictInfo | null;
    error: string | null;
  }>({
    isLanding: false,
    isCheckingConflicts: false,
    conflictInfo: null,
    error: null,
  });

  // Check for conflicts when dialog opens
  createEffect(() => {
    if (props.worktree && props.destination) {
      checkForConflicts();
    }
  });

  const checkForConflicts = async () => {
    if (!props.worktree || !props.destination) return;

    setState({ isCheckingConflicts: true });
    try {
      // Check for conflicts in the revset being landed
      const baseRevset = props.worktree.base_revset ?? "@-";
      const revset = `${baseRevset}..@`;
      const conflictInfo = await checkConflicts(props.worktree.id, revset);
      setState({ conflictInfo, isCheckingConflicts: false });
    } catch (err) {
      // Don't block landing on conflict check failure
      console.error("Failed to check conflicts:", err);
      setState({ isCheckingConflicts: false });
    }
  };

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
    !!props.worktree && !!props.destination && !state.isLanding && !state.isCheckingConflicts;

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
        <Dialog title="Land worktree">
          <div class="flex flex-col gap-4 px-6 pb-6 text-14-regular text-text-base">
            <Show when={props.worktree && props.destination}>
              <div>
                This will squash changes from{" "}
                <span class="text-text-strong">{props.worktree?.name ?? ""}</span> into{" "}
                <span class="text-text-strong">{props.destination?.name ?? ""}</span> and then
                delete the worktree agent directory.
              </div>
            </Show>

            {/* Conflict Warning Section */}
            <Show when={state.conflictInfo?.hasConflicts}>
              <div class="rounded-md bg-surface-warning-weak px-3 py-2">
                <div class="flex items-center gap-2 text-13-regular font-medium text-text-on-warning-weak">
                  <Icon name="circle-ban-sign" size="small" />
                  <span>Conflicts detected</span>
                </div>
                <div class="mt-2 text-12-regular text-text-on-warning-weak">
                  The following commits have conflicts that will need to be resolved:
                </div>
                <ul class="mt-2 space-y-1">
                  <For each={state.conflictInfo?.conflictedCommits ?? []}>
                    {(commit) => (
                      <li class="text-12-regular text-text-on-warning-weak">
                        <code class="font-mono">{commit.changeId}</code>
                        <span class="text-text-weak"> - </span>
                        <span>{commit.description || "(no description)"}</span>
                        <Show when={commit.conflictedFiles.length > 0}>
                          <div class="ml-4 mt-1 text-11-regular opacity-80">
                            Files: {commit.conflictedFiles.join(", ")}
                          </div>
                        </Show>
                      </li>
                    )}
                  </For>
                </ul>
              </div>
            </Show>

            <div class="rounded-md bg-surface-base px-3 py-2 text-13-regular text-text-weak">
              Uses <code class="font-mono text-text-base">jj squash</code> into the destination
              workspace's <code class="font-mono text-text-base">@</code>. If there are conflicts,
              they'll appear in the destination workspace.
            </div>

            <Show when={state.error}>
              {(error) => (
                <div class="rounded-md bg-surface-critical-weak px-3 py-2 text-13-regular text-text-on-critical-weak">
                  {error()}
                </div>
              )}
            </Show>

            <div class="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={props.onClose} disabled={state.isLanding}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleLand} disabled={!canLand()}>
                {state.isLanding
                  ? "Landing…"
                  : state.isCheckingConflicts
                    ? "Checking…"
                    : state.conflictInfo?.hasConflicts
                      ? "Land anyway"
                      : "Land and delete"}
              </Button>
            </div>
          </div>
        </Dialog>
      </KobalteDialog.Portal>
    </KobalteDialog>
  );
}
