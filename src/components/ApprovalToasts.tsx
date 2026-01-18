import { For, Show, createMemo, createEffect, onCleanup } from "solid-js";
import { Icon, Keybind } from "../ui";
import type { ApprovalRequest, WorkspaceInfo } from "../types";

type ApprovalToastsProps = {
  approvals: ApprovalRequest[];
  workspaces: WorkspaceInfo[];
  onDecision: (request: ApprovalRequest, decision: "accept" | "decline") => void;
};

function formatMethodName(method: string): string {
  const parts = method.split("/");
  const name = parts[parts.length - 1] || method;
  return name
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .trim()
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
}

function formatParams(params: Record<string, unknown>): string {
  const entries = Object.entries(params);
  if (entries.length === 0) return "{}";
  
  const simplified: Record<string, unknown> = {};
  for (const [key, value] of entries) {
    if (typeof value === "string" && value.length > 100) {
      simplified[key] = value.slice(0, 100) + "...";
    } else {
      simplified[key] = value;
    }
  }
  
  return JSON.stringify(simplified, null, 2);
}

export function ApprovalToasts(props: ApprovalToastsProps) {
  const workspaceLabels = createMemo(() =>
    new Map(props.workspaces.map((workspace) => [workspace.id, workspace.name]))
  );

  const firstApproval = () => props.approvals[0];

  createEffect(() => {
    const approval = firstApproval();
    if (!approval) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      if (event.key === "y" || event.key === "Y") {
        event.preventDefault();
        props.onDecision(approval, "accept");
      } else if (event.key === "n" || event.key === "N") {
        event.preventDefault();
        props.onDecision(approval, "decline");
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    onCleanup(() => document.removeEventListener("keydown", handleKeyDown));
  });

  return (
    <Show when={props.approvals.length > 0}>
      <div class="approval-toasts" role="region" aria-live="assertive">
        <For each={props.approvals}>
          {(request) => {
            const workspaceName = () => workspaceLabels().get(request.workspace_id);
            const methodDisplay = () => formatMethodName(request.method);
            const paramsDisplay = () => formatParams(request.params);
            
            return (
              <div class="approval-toast" role="alert">
                <div class="approval-toast-header">
                  <div class="approval-toast-title">
                    <Icon name="circle-check" size="small" style={{ "margin-right": "4px", "vertical-align": "-2px" }} />
                    Approval Required
                  </div>
                  <Show when={workspaceName()}>
                    <div class="approval-toast-workspace">{workspaceName()}</div>
                  </Show>
                </div>
                <div class="approval-toast-method">{methodDisplay()}</div>
                <div class="approval-toast-body">{paramsDisplay()}</div>
                <div class="approval-toast-actions">
                  <button
                    type="button"
                    class="secondary"
                    onClick={() => props.onDecision(request, "decline")}
                  >
                    Deny
                    <Keybind class="ml-2 opacity-60">N</Keybind>
                  </button>
                  <button
                    type="button"
                    class="primary"
                    onClick={() => props.onDecision(request, "accept")}
                  >
                    Allow
                    <Keybind class="ml-2 opacity-80">Y</Keybind>
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
