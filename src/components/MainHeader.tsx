import { Show } from "solid-js";
import type { WorktreeDivergence, WorkspaceInfo } from "../types";

type MainHeaderProps = {
  workspace: WorkspaceInfo;
  branchName: string;
  divergence?: WorktreeDivergence | null;
};

export function MainHeader(props: MainHeaderProps) {
  return (
    <header class="flex items-center gap-3 px-6 py-2.5" data-tauri-drag-region>
      <div class="rounded-md bg-white/10 px-2.5 py-1 text-xs font-medium text-text-primary">
        {props.branchName}
      </div>
      <Show when={props.divergence}>
        {(div) => (
          <div class="flex items-center gap-1 rounded-md bg-accent/15 px-2 py-1 font-mono text-[11px]">
            <span class="text-success">+{div().ahead}</span>
            <span class="text-text-subtle">/</span>
            <span class="text-danger">-{div().behind}</span>
          </div>
        )}
      </Show>
      <div class="flex flex-col">
        <span class="text-sm font-semibold text-text-primary">{props.workspace.name}</span>
        <span class="text-[11px] text-text-subtle">{props.workspace.path}</span>
      </div>
    </header>
  );
}
