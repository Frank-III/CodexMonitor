import { createMemo, createSignal, For, Show } from "solid-js";
import { DropdownMenu } from "../ui/DropdownMenu";
import { Icon, IconButton, Tooltip } from "../ui";
import type { WorktreeDivergence, WorkspaceInfo } from "../types";
import type { WorktreeStackOpState } from "../stores/worktreeStackOps";

type DivergenceEntry = {
  data?: WorktreeDivergence;
  isLoading: boolean;
  error: string | null;
};

type StackRow = {
  workspace: WorkspaceInfo;
  depth: number;
};

type JjStackPanelProps = {
  root: WorkspaceInfo | null;
  rows: StackRow[];
  activeWorkspaceId: string | null;
  stackOp?: WorktreeStackOpState | null;
  onClearStackOp?: () => void;
  divergenceByWorkspaceId: Record<string, DivergenceEntry | undefined>;
  descendantCountByWorkspaceId: Record<string, number | undefined>;
  onRefresh: () => void;
  onSelectWorkspace: (workspaceId: string) => void;
  onEditBaseRevset: (workspaceId: string) => void;
  onReparentWorktree: (workspaceId: string) => void;
  onSyncWorktree: (workspaceId: string) => void;
  onSyncWorktreeStack: (workspaceId: string) => void;
  onLandWorktree: (workspaceId: string) => void;
  onLandWorktreeStack: (workspaceId: string) => void;
};

export function JjStackPanel(props: JjStackPanelProps) {
  const stackOp = () => props.stackOp ?? null;
  const stackOpSummary = createMemo(() => {
    const op = stackOp();
    if (!op) return null;
    const verb = op.action === "sync" ? "Sync" : "Land";
    const label = op.running
      ? `${verb}ing`
      : op.ok === true
        ? `${verb}ed`
        : op.ok === false
          ? `${verb} failed`
          : verb;
    return {
      label,
      completed: op.completed,
      total: op.total,
      running: op.running,
      ok: op.ok,
      error: op.error,
    };
  });

  return (
    <aside data-component="jj-stack-panel" class="flex flex-col gap-3 p-4 flex-1 min-h-0">
      {/* Header */}
      <div data-slot="jj-stack-header" class="flex justify-between items-center">
        <div class="inline-flex items-center gap-2 min-w-0">
          <span class="text-12-medium uppercase tracking-wide text-text-weak">JJ Stack</span>
          <Show when={props.root}>
            {(root) => (
              <span class="text-11-regular px-2 py-0.5 rounded bg-surface-raised-base text-text-base truncate max-w-[140px]">
                {root().name}
              </span>
            )}
          </Show>
        </div>
        <div class="inline-flex items-center gap-2 shrink-0">
          <Show when={stackOpSummary()}>
            {(summary) => (
              <div class="inline-flex items-center gap-1.5">
                <span
                  classList={{
                    "inline-flex items-center gap-1 px-2 py-0.5 rounded text-11-regular": true,
                    "bg-surface-interactive-weak text-text-interactive-base": summary().running,
                    "bg-surface-success-weak text-text-on-success-base": !summary().running && summary().ok === true,
                    "bg-surface-critical-weak text-text-on-critical-weak": !summary().running && summary().ok === false,
                    "bg-surface-raised-base text-text-base": !summary().running && summary().ok === null,
                  }}
                  title={summary().error ?? `${summary().label} ${summary().completed}/${summary().total}`}
                >
                  {summary().label}
                  <span class="font-mono text-10-regular opacity-80">
                    {summary().completed}/{summary().total}
                  </span>
                </span>
                <Show when={!summary().running && !!props.onClearStackOp}>
                  <Tooltip placement="top" value="Clear">
                    <IconButton
                      icon="close"
                      variant="ghost"
                      size="normal"
                      onClick={() => props.onClearStackOp?.()}
                      aria-label="Clear stack operation"
                    />
                  </Tooltip>
                </Show>
              </div>
            )}
          </Show>
          <Tooltip placement="top" value="Refresh">
            <IconButton
              icon="refresh"
              variant="ghost"
              size="normal"
              onClick={props.onRefresh}
              aria-label="Refresh stack"
            />
          </Tooltip>
        </div>
      </div>

      {/* Error display */}
      <Show when={stackOp()?.error}>
        <div class="text-12-regular text-text-on-critical-weak bg-surface-critical-weak rounded-md px-2.5 py-2 whitespace-pre-wrap break-words">
          {stackOp()?.error}
        </div>
      </Show>

      {/* Stack list */}
      <Show when={props.root} fallback={<div class="text-13-regular text-text-weak py-3">Select a workspace.</div>}>
        <Show when={props.rows.length} fallback={<div class="text-13-regular text-text-weak py-3">No worktrees.</div>}>
          <div data-slot="jj-stack-list" class="flex flex-col gap-1 overflow-y-auto flex-1 min-h-0">
            <For each={props.rows}>
              {(row) => (
                <StackRowItem
                  row={row}
                  activeWorkspaceId={props.activeWorkspaceId}
                  stackOp={stackOp()}
                  divergenceEntry={props.divergenceByWorkspaceId[row.workspace.id]}
                  descendantCount={props.descendantCountByWorkspaceId[row.workspace.id] ?? 0}
                  onSelectWorkspace={props.onSelectWorkspace}
                  onEditBaseRevset={props.onEditBaseRevset}
                  onReparentWorktree={props.onReparentWorktree}
                  onSyncWorktree={props.onSyncWorktree}
                  onSyncWorktreeStack={props.onSyncWorktreeStack}
                  onLandWorktree={props.onLandWorktree}
                  onLandWorktreeStack={props.onLandWorktreeStack}
                />
              )}
            </For>
          </div>
        </Show>
      </Show>
    </aside>
  );
}

function StackRowItem(props: {
  row: StackRow;
  activeWorkspaceId: string | null;
  stackOp: WorktreeStackOpState | null;
  divergenceEntry: DivergenceEntry | undefined;
  descendantCount: number;
  onSelectWorkspace: (workspaceId: string) => void;
  onEditBaseRevset: (workspaceId: string) => void;
  onReparentWorktree: (workspaceId: string) => void;
  onSyncWorktree: (workspaceId: string) => void;
  onSyncWorktreeStack: (workspaceId: string) => void;
  onLandWorktree: (workspaceId: string) => void;
  onLandWorktreeStack: (workspaceId: string) => void;
}) {
  const [menuOpen, setMenuOpen] = createSignal(false);
  const workspace = () => props.row.workspace;
  const isActive = () => props.activeWorkspaceId === workspace().id;
  const behindCount = () => props.divergenceEntry?.data?.behind ?? 0;
  const stepState = () => props.stackOp?.steps_by_workspace_id[workspace().id] ?? null;

  return (
    <div
      data-slot="jj-stack-row"
      classList={{
        "group/row w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-md cursor-pointer transition-colors": true,
        "bg-surface-raised-base hover:bg-surface-raised-base-hover": !isActive(),
        "bg-surface-base-active": isActive(),
      }}
      style={{ "padding-left": `${Math.max(0, props.row.depth) * 14 + 10}px` }}
      role="button"
      tabIndex={0}
      onClick={() => props.onSelectWorkspace(workspace().id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          props.onSelectWorkspace(workspace().id);
        }
      }}
    >
      {/* Left side */}
      <div class="flex items-center gap-1.5 min-w-0 overflow-hidden">
        <Icon name="arrow-branch" size="small" class="text-icon-weak shrink-0" />
        <span class="text-13-regular text-text-strong truncate">{workspace().name}</span>
        <Show when={props.descendantCount > 0}>
          <span
            class="font-mono text-10-regular px-1.5 py-0.5 rounded bg-surface-base text-text-base"
            title={`${props.descendantCount} downstream worktree${props.descendantCount === 1 ? "" : "s"}`}
          >
            +{props.descendantCount}
          </span>
        </Show>
      </div>

      {/* Right side */}
      <div class="flex items-center gap-1.5 shrink-0">
        {/* Step status indicator */}
        <Show when={stepState()}>
          {(step) => (
            <span
              classList={{
                "size-2 rounded-full": true,
                "bg-surface-base": step().status === "pending",
                "bg-text-interactive-base animate-pulse": step().status === "running",
                "bg-text-on-success-base": step().status === "success",
                "bg-text-on-critical-base": step().status === "error",
              }}
              title={
                step().status === "error"
                  ? step().message ?? "Error"
                  : `${step().status} (${step().index}/${step().total})`
              }
              aria-label={`Stack operation status: ${step().status}`}
            />
          )}
        </Show>

        {/* Divergence indicator */}
        <Show when={props.divergenceEntry}>
          {(div) => (
            <span
              classList={{
                "inline-flex items-center gap-0.5 text-10-regular font-mono": true,
                "opacity-50": div().isLoading,
              }}
              title={
                div().error
                  ? String(div().error)
                  : div().data?.base_name
                    ? `Base: ${div().data!.base_name} @ ${div().data!.base_revset}`
                    : "Workspace divergence"
              }
            >
              <Show
                when={div().data}
                fallback={
                  <span class="text-text-weak">
                    {div().error ? "!" : div().isLoading ? "…" : ""}
                  </span>
                }
              >
                {(data) => (
                  <>
                    <span class="text-text-on-success-base">+{data().ahead}</span>
                    <span class="text-text-on-critical-weak">-{data().behind}</span>
                  </>
                )}
              </Show>
            </span>
          )}
        </Show>

        {/* Sync button (shown when behind) */}
        <Show when={behindCount() > 0}>
          <Tooltip placement="top" value={`Sync with parent (behind ${behindCount()})`}>
            <IconButton
              icon="sync"
              variant="ghost"
              size="normal"
              onClick={(event) => {
                event.stopPropagation();
                props.onSyncWorktree(workspace().id);
              }}
              aria-label="Sync with parent"
            />
          </Tooltip>
        </Show>

        {/* Menu */}
        <DropdownMenu open={menuOpen()} onOpenChange={setMenuOpen}>
          <DropdownMenu.Trigger
            as={IconButton}
            icon="dot-grid"
            variant="ghost"
            class="shrink-0 size-6 rounded-md opacity-0 group-hover/row:opacity-100 data-[expanded]:opacity-100"
            onClick={(e: MouseEvent) => e.stopPropagation()}
          />
          <DropdownMenu.Portal>
            <DropdownMenu.Content class="mt-1" onClick={(e: MouseEvent) => e.stopPropagation()}>
              <DropdownMenu.Item
                onSelect={() => {
                  props.onEditBaseRevset(workspace().id);
                  setMenuOpen(false);
                }}
              >
                <DropdownMenu.ItemLabel>Edit base revset…</DropdownMenu.ItemLabel>
              </DropdownMenu.Item>
              <DropdownMenu.Item
                onSelect={() => {
                  props.onReparentWorktree(workspace().id);
                  setMenuOpen(false);
                }}
              >
                <DropdownMenu.ItemLabel>Reparent / restack…</DropdownMenu.ItemLabel>
              </DropdownMenu.Item>
              <DropdownMenu.Separator />
              <DropdownMenu.Item
                onSelect={() => {
                  props.onSyncWorktree(workspace().id);
                  setMenuOpen(false);
                }}
              >
                <DropdownMenu.ItemLabel>
                  {`Sync with parent${behindCount() > 0 ? ` (behind ${behindCount()})` : ""}`}
                </DropdownMenu.ItemLabel>
              </DropdownMenu.Item>
              <Show when={props.descendantCount > 0}>
                <DropdownMenu.Item
                  onSelect={() => {
                    props.onSyncWorktreeStack(workspace().id);
                    setMenuOpen(false);
                  }}
                >
                  <DropdownMenu.ItemLabel>{`Sync stack (+${props.descendantCount})`}</DropdownMenu.ItemLabel>
                </DropdownMenu.Item>
              </Show>
              <DropdownMenu.Separator />
              <DropdownMenu.Item
                class="text-text-on-critical-weak"
                onSelect={() => {
                  props.onLandWorktree(workspace().id);
                  setMenuOpen(false);
                }}
              >
                <DropdownMenu.ItemLabel>Land into parent…</DropdownMenu.ItemLabel>
              </DropdownMenu.Item>
              <Show when={props.descendantCount > 0}>
                <DropdownMenu.Item
                  class="text-text-on-critical-weak"
                  onSelect={() => {
                    props.onLandWorktreeStack(workspace().id);
                    setMenuOpen(false);
                  }}
                >
                  <DropdownMenu.ItemLabel>{`Land stack (+${props.descendantCount})`}</DropdownMenu.ItemLabel>
                </DropdownMenu.Item>
              </Show>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu>
      </div>
    </div>
  );
}
