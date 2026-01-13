import { For, Show } from "solid-js";
import type { ApprovalRequest, WorkspaceInfo } from "../types";

type ApprovalToastsProps = {
  approvals: ApprovalRequest[];
  workspaces: WorkspaceInfo[];
  onDecision: (request: ApprovalRequest, decision: "accept" | "decline") => void;
};

export function ApprovalToasts(props: ApprovalToastsProps) {
  const workspaceLabels = () =>
    new Map(props.workspaces.map((workspace) => [workspace.id, workspace.name]));

  return (
    <Show when={props.approvals.length > 0}>
      <div class="approval-toasts" role="region" aria-live="assertive">
        <For each={props.approvals}>
          {(request) => {
            const workspaceName = () => workspaceLabels().get(request.workspace_id);
            return (
              <div class="approval-toast" role="alert">
                <div class="approval-toast-header">
                  <div class="approval-toast-title">Approval needed</div>
                  <Show when={workspaceName()}>
                    <div class="approval-toast-workspace">{workspaceName()}</div>
                  </Show>
                </div>
                <div class="approval-toast-method">{request.method}</div>
                <div class="approval-toast-body">
                  {JSON.stringify(request.params, null, 2)}
                </div>
                <div class="approval-toast-actions">
                  <button
                    class="secondary"
                    onClick={() => props.onDecision(request, "decline")}
                  >
                    Decline
                  </button>
                  <button
                    class="primary"
                    onClick={() => props.onDecision(request, "accept")}
                  >
                    Approve
                  </button>
                </div>
              </div>
            );
          }}
        </For>
      </div>
    </Show>
  );
}
