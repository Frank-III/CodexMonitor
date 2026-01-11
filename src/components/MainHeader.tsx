import type { WorkspaceInfo } from "../types";

type MainHeaderProps = {
  workspace: WorkspaceInfo;
  branchName: string;
};

export function MainHeader(props: MainHeaderProps) {
  return (
    <header class="main-header" data-tauri-drag-region>
      <div class="workspace-header">
        <div class="branch-pill">{props.branchName}</div>
        <div>
          <div class="workspace-title">{props.workspace.name}</div>
          <div class="workspace-meta">{props.workspace.path}</div>
        </div>
      </div>
    </header>
  );
}
