import { createEffect, createMemo, createSignal, type Accessor } from "solid-js";
import type { AccessMode, ApprovalPolicy, Attachment, QueuedMessage } from "../types";

export type QueuedSendStore = {
  queuedByThreadId: () => Record<string, QueuedMessage[]>;
  activeQueue: () => QueuedMessage[];
  sendOrQueue: (
    text: string,
    options: {
      attachments?: Attachment[];
      approvalPolicy?: ApprovalPolicy;
      accessMode?: AccessMode;
    },
  ) => Promise<"sent" | "queued">;
  queue: (
    text: string,
    options: {
      attachments?: Attachment[];
      approvalPolicy?: ApprovalPolicy;
      accessMode?: AccessMode;
    },
  ) => Promise<"queued" | "ignored">;
  removeQueuedMessage: (threadId: string, messageId: string) => void;
  removeActiveQueuedMessage: (messageId: string) => void;
  clearActiveQueue: () => void;
};

const createQueueId = () => {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
};

export function createQueuedSendStore(options: {
  activeThreadId: Accessor<string | null>;
  isProcessing: Accessor<boolean>;
  steerEnabled: Accessor<boolean>;
  sendNow: (
    text: string,
    options?: {
      attachments?: Attachment[];
      approvalPolicy?: ApprovalPolicy;
      accessMode?: AccessMode;
    },
  ) => Promise<void>;
}): QueuedSendStore {
  const [queuedByThreadId, setQueuedByThreadId] = createSignal<Record<string, QueuedMessage[]>>({});
  const [flushingThreadId, setFlushingThreadId] = createSignal<string | null>(null);

  const activeQueue = createMemo(() => {
    const threadId = options.activeThreadId();
    if (!threadId) {
      return [];
    }
    return queuedByThreadId()[threadId] ?? [];
  });

  const removeQueuedMessage = (threadId: string, messageId: string) => {
    setQueuedByThreadId((prev) => {
      const existing = prev[threadId] ?? [];
      const nextQueue = existing.filter((entry) => entry.id !== messageId);
      if (nextQueue.length === existing.length) {
        return prev;
      }
      return { ...prev, [threadId]: nextQueue };
    });
  };

  const removeActiveQueuedMessage = (messageId: string) => {
    const threadId = options.activeThreadId();
    if (!threadId) {
      return;
    }
    removeQueuedMessage(threadId, messageId);
  };

  const clearActiveQueue = () => {
    const threadId = options.activeThreadId();
    if (!threadId) {
      return;
    }
    setQueuedByThreadId((prev) => {
      if (!prev[threadId]?.length) {
        return prev;
      }
      return { ...prev, [threadId]: [] };
    });
  };

  const sendOrQueue: QueuedSendStore["sendOrQueue"] = async (text, sendOptions) => {
    const trimmed = text.trim();
    const attachments = sendOptions.attachments ?? [];
    if (!trimmed && attachments.length === 0) {
      return "sent";
    }

    const threadId = options.activeThreadId();
    if (threadId && options.isProcessing() && !options.steerEnabled()) {
      const entry: QueuedMessage = {
        id: createQueueId(),
        threadId,
        text: trimmed,
        createdAt: Date.now(),
        attachments,
        approvalPolicy: sendOptions.approvalPolicy,
        accessMode: sendOptions.accessMode,
      };
      setQueuedByThreadId((prev) => ({
        ...prev,
        [threadId]: [...(prev[threadId] ?? []), entry],
      }));
      return "queued";
    }

    await options.sendNow(trimmed, {
      attachments,
      approvalPolicy: sendOptions.approvalPolicy,
      accessMode: sendOptions.accessMode,
    });
    return "sent";
  };

  const queue: QueuedSendStore["queue"] = async (text, sendOptions) => {
    const trimmed = text.trim();
    const attachments = sendOptions.attachments ?? [];
    if (!trimmed && attachments.length === 0) {
      return "ignored";
    }

    const threadId = options.activeThreadId();
    if (!threadId) {
      return "ignored";
    }

    const entry: QueuedMessage = {
      id: createQueueId(),
      threadId,
      text: trimmed,
      createdAt: Date.now(),
      attachments,
      approvalPolicy: sendOptions.approvalPolicy,
      accessMode: sendOptions.accessMode,
    };

    setQueuedByThreadId((prev) => ({
      ...prev,
      [threadId]: [...(prev[threadId] ?? []), entry],
    }));

    return "queued";
  };

  createEffect(() => {
    const threadId = options.activeThreadId();
    if (!threadId) {
      return;
    }
    if (options.isProcessing()) {
      return;
    }
    if (flushingThreadId() === threadId) {
      return;
    }

    const queue = queuedByThreadId()[threadId] ?? [];
    if (queue.length === 0) {
      return;
    }

    const nextItem = queue[0];
    setFlushingThreadId(threadId);
    setQueuedByThreadId((prev) => ({
      ...prev,
      [threadId]: (prev[threadId] ?? []).slice(1),
    }));

    void (async () => {
      try {
        await options.sendNow(nextItem.text, {
          attachments: nextItem.attachments ?? [],
          approvalPolicy: nextItem.approvalPolicy,
          accessMode: nextItem.accessMode,
        });
      } catch {
        setQueuedByThreadId((prev) => ({
          ...prev,
          [threadId]: [nextItem, ...(prev[threadId] ?? [])],
        }));
      } finally {
        setFlushingThreadId(null);
      }
    })();
  });

  return {
    queuedByThreadId,
    activeQueue,
    sendOrQueue,
    queue,
    removeQueuedMessage,
    removeActiveQueuedMessage,
    clearActiveQueue,
  };
}
