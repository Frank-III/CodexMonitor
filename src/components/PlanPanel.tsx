import { For, Show } from "solid-js";
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
          <button
            class="plan-dismiss ghost icon-button"
            onClick={props.onDismiss}
            aria-label="Dismiss plan"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M18 6L6 18M6 6l12 12"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
              />
            </svg>
          </button>
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
