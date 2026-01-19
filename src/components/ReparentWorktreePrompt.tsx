import { Dialog as KobalteDialog } from "@kobalte/core/dialog";
import { Show, createMemo } from "solid-js";
import { createStore } from "solid-js/store";
import type { WorkspaceInfo } from "../types";
import { Button, Checkbox, Dialog, Select, TextField } from "../ui";

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
        <Dialog title="Reparent worktree">
          <div class="flex flex-col gap-4 px-6 pb-6">
            <Show when={props.worktree} fallback={<div class="text-13-regular text-text-weak">Select a worktree to reparent.</div>}>
              {(worktree) => (
                <>
                  <div class="text-13-regular text-text-weak">
                    Moves <span class="text-text-strong">{worktree().name}</span> onto a new base workspace by running{" "}
                    <code class="font-mono text-text-base">jj rebase -b @ -o &lt;base&gt;</code>.
                  </div>

                  <div class="grid gap-4">
                    <div class="flex flex-col gap-2">
                      <div class="text-12-medium text-text-weak">Base workspace</div>
                      <Select<WorkspaceInfo>
                        size="large"
                        variant="secondary"
                        options={props.bases}
                        current={selectedBase() ?? undefined}
                        value={(entry) => entry.id}
                        label={(entry) => (entry.kind === "main" ? `Main: ${entry.name}` : `Worktree: ${entry.name}`)}
                        groupBy={(entry) => (entry.kind === "main" ? "Main" : "Worktrees")}
                        onSelect={(entry) => {
                          if (!entry) return;
                          handleBaseChange(entry.id);
                        }}
                        disabled={state.isSaving || props.bases.length === 0}
                      />
                      <Show when={!props.bases.length}>
                        <div class="text-13-regular text-text-on-critical-weak">
                          No valid bases found (cannot reparent onto itself or descendants).
                        </div>
                      </Show>
                    </div>

                    <TextField
                      label="Base revset"
                      value={state.baseRevset}
                      onChange={(value) => {
                        setState({
                          baseRevset: value,
                          baseRevsetDirty: true,
                        });
                      }}
                      placeholder={defaultRevsetForBase(selectedBase())}
                      disabled={state.isSaving}
                      spellcheck={false}
                      class="font-mono"
                      description="Use @ for base working copy, @- for the base commit, or trunk() on main."
                    />

                    <div class="rounded-md bg-surface-base px-3 py-2">
                      <Checkbox
                        checked={state.restack}
                        disabled={state.isSaving || props.descendantCount === 0}
                        onChange={(checked) => setState({ restack: checked })}
                        description={
                          props.descendantCount > 0
                            ? `Rebase ${props.descendantCount} downstream worktree(s) onto the updated base chain.`
                            : "No downstream worktrees found."
                        }
                      >
                        Restack downstream worktrees
                      </Checkbox>
                    </div>
                  </div>

                  <Show when={isNoop()}>
                    <div class="rounded-md bg-surface-base px-3 py-2 text-13-regular text-text-weak">
                      No changes selected.
                    </div>
                  </Show>

                  <Show when={state.error}>
                    {(error) => (
                      <div class="rounded-md bg-surface-critical-weak px-3 py-2 text-13-regular text-text-on-critical-weak">
                        {error()}
                      </div>
                    )}
                  </Show>
                </>
              )}
            </Show>

            <div class="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={props.onClose} disabled={state.isSaving}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleReparent} disabled={!canSave()}>
                {state.isSaving ? "Reparenting…" : "Reparent"}
              </Button>
            </div>
          </div>
        </Dialog>
      </KobalteDialog.Portal>
    </KobalteDialog>
  );
}
