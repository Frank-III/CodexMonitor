import { For, Show } from "solid-js";
import { IconButton } from "../ui";
import type { TurnPlan, TurnPlanStepStatus } from "../types";

type PlanPanelProps = {
  plan: TurnPlan | null;
  isProcessing: boolean;
  onDismiss?: () => void;
};

function formatProgress(plan: TurnPlan) {
  const total = plan.steps.length;
  if (!total) return "";
  const completed = plan.steps.filter((step) => step.status === "completed").length;
  return `${completed}/${total}`;
}

function statusLabel(status: TurnPlanStepStatus) {
  if (status === "completed") return "[x]";
  if (status === "inProgress") return "[>]";
  return "[ ]";
}

export function PlanPanel(props: PlanPanelProps) {
  const progress = () => (props.plan ? formatProgress(props.plan) : "");
  const steps = () => props.plan?.steps ?? [];
  const showEmpty = () => !steps().length && !props.plan?.explanation;
  const emptyLabel = () =>
    props.isProcessing ? "Waiting on a plan..." : "No active plan.";

  return (
    <aside class="plan-panel">
      <div class="plan-header">
        <span>Plan</span>
        <Show when={progress()}>
          <span class="plan-progress">{progress()}</span>
        </Show>
        <Show when={props.onDismiss}>
          <IconButton
            type="button"
            icon="close"
            variant="ghost"
            class="plan-dismiss"
            onClick={props.onDismiss}
            aria-label="Dismiss plan"
          />
        </Show>
      </div>
      <Show when={props.plan?.explanation}>
        <div class="plan-explanation">{props.plan!.explanation}</div>
      </Show>
      <Show
        when={!showEmpty()}
        fallback={<div class="plan-empty">{emptyLabel()}</div>}
      >
        <ol class="plan-list">
          <For each={steps()}>
            {(step) => (
              <li class={`plan-step ${step.status}`}>
                <span class="plan-step-status" aria-hidden>
                  {statusLabel(step.status)}
                </span>
                <span class="plan-step-text">{step.step}</span>
              </li>
            )}
          </For>
        </ol>
      </Show>
    </aside>
  );
}
