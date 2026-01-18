import { For, Show } from "solid-js";
import type { ApprovalRequest } from "../types";

type ApprovalsProps = {
  approvals: ApprovalRequest[];
  onDecision: (request: ApprovalRequest, decision: "accept" | "decline") => void;
};

export function Approvals(props: ApprovalsProps) {
  return (
    <Show when={props.approvals.length}>
      <div class="approvals">
        <div class="approvals-title">Approvals</div>
        <For each={props.approvals}>
          {(request) => (
            <div class="approval-card">
              <div class="approval-method">{request.method}</div>
              <div class="approval-body">
                {JSON.stringify(request.params, null, 2)}
              </div>
              <div class="approval-actions">
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
          )}
        </For>
      </div>
    </Show>
  );
}
