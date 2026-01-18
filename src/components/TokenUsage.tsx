import { Show } from "solid-js";
import type { TokenUsage as TokenUsageType, ThreadUsage } from "../types";

type TokenUsageProps = {
  currentUsage: () => TokenUsageType | null;
  threadUsage: () => ThreadUsage | undefined;
  sessionTotals: () => { input: number; output: number };
};

function formatTokenCount(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}K`;
  }
  return count.toString();
}

export function TokenUsage(props: TokenUsageProps) {
  const hasAnyUsage = () => {
    const session = props.sessionTotals();
    return session.input > 0 || session.output > 0;
  };

  return (
    <Show when={hasAnyUsage()}>
      <div class="token-usage">
        <Show when={props.threadUsage()}>
          {(usage) => (
            <div class="token-usage-thread">
              <span class="token-usage-label">Thread:</span>
              <span class="token-usage-value">
                <span class="token-input" title="Input tokens">
                  {formatTokenCount(usage().totalInputTokens)}
                </span>
                <span class="token-separator">/</span>
                <span class="token-output" title="Output tokens">
                  {formatTokenCount(usage().totalOutputTokens)}
                </span>
              </span>
              <span class="token-usage-turns">
                ({usage().turnCount} turn{usage().turnCount === 1 ? "" : "s"})
              </span>
            </div>
          )}
        </Show>
        <Show when={props.currentUsage()}>
          {(current) => (
            <div class="token-usage-turn">
              <span class="token-usage-label">Last:</span>
              <span class="token-usage-value">
                <span class="token-input" title="Input tokens">
                  {formatTokenCount(current().inputTokens)}
                </span>
                <span class="token-separator">/</span>
                <span class="token-output" title="Output tokens">
                  {formatTokenCount(current().outputTokens)}
                </span>
              </span>
            </div>
          )}
        </Show>
      </div>
    </Show>
  );
}
