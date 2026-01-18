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
      <div class="rounded-md bg-surface-base px-2.5 py-1 text-12-medium text-text-strong">
        {props.branchName}
      </div>
      <Show when={props.divergence}>
        {(div) => (
          <div class="flex items-center gap-1 rounded-md bg-surface-interactive-weak px-2 py-1 font-mono text-12-medium">
            <span class="text-text-on-success-base">+{div().ahead}</span>
            <span class="text-text-weak">/</span>
            <span class="text-text-on-critical-base">-{div().behind}</span>
          </div>
        )}
      </Show>
      <div class="flex flex-col">
        <span class="text-14-medium text-text-strong">{props.workspace.name}</span>
        <span class="text-12-regular text-text-base">{props.workspace.path}</span>
      </div>
    </header>
  );
}
