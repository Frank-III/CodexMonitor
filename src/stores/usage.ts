import { createMemo } from "solid-js";
import { createStore, produce } from "solid-js/store";
import type { TokenUsage, ThreadUsage } from "../types";

type UsageState = {
  usageByThread: Record<string, ThreadUsage>;
  currentTurnUsage: TokenUsage | null;
};

export type UsageStore = {
  currentTurnUsage: () => TokenUsage | null;
  threadUsage: (threadId: string) => ThreadUsage | undefined;
  activeThreadUsage: () => ThreadUsage | undefined;
  totalSessionTokens: () => { input: number; output: number };
  recordTurnUsage: (threadId: string, usage: TokenUsage) => void;
  setCurrentTurnUsage: (usage: TokenUsage | null) => void;
  clearThreadUsage: (threadId: string) => void;
};

export function createUsageStore(
  activeThreadId: () => string | null
): UsageStore {
  const [state, setState] = createStore<UsageState>({
    usageByThread: {},
    currentTurnUsage: null,
  });

  const currentTurnUsage = () => state.currentTurnUsage;

  const threadUsage = (threadId: string) => state.usageByThread[threadId];

  const activeThreadUsage = createMemo(() => {
    const threadId = activeThreadId();
    if (!threadId) return undefined;
    return state.usageByThread[threadId];
  });

  const totalSessionTokens = createMemo(() => {
    let input = 0;
    let output = 0;
    Object.values(state.usageByThread).forEach((usage) => {
      input += usage.totalInputTokens;
      output += usage.totalOutputTokens;
    });
    return { input, output };
  });

  function recordTurnUsage(threadId: string, usage: TokenUsage): void {
    setState(
      produce((s) => {
        const existing = s.usageByThread[threadId];
        if (existing) {
          existing.turnCount += 1;
          existing.totalInputTokens += usage.inputTokens;
          existing.totalOutputTokens += usage.outputTokens;
          existing.lastUpdated = Date.now();
        } else {
          s.usageByThread[threadId] = {
            threadId,
            turnCount: 1,
            totalInputTokens: usage.inputTokens,
            totalOutputTokens: usage.outputTokens,
            lastUpdated: Date.now(),
          };
        }
        s.currentTurnUsage = usage;
      })
    );
  }

  function setCurrentTurnUsage(usage: TokenUsage | null): void {
    setState("currentTurnUsage", usage);
  }

  function clearThreadUsage(threadId: string): void {
    setState(
      produce((s) => {
        delete s.usageByThread[threadId];
      })
    );
  }

  return {
    currentTurnUsage,
    threadUsage,
    activeThreadUsage,
    totalSessionTokens,
    recordTurnUsage,
    setCurrentTurnUsage,
    clearThreadUsage,
  };
}
