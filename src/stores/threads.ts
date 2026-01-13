import { createMemo } from "solid-js";
import { createStore, produce } from "solid-js/store";
import type {
  AccessMode,
  ApprovalPolicy,
  Attachment,
  ApprovalRequest,
  ConversationItem,
  DebugEntry,
  ThreadSummary,
  TokenUsage,
  WorkspaceInfo,
} from "../types";
import {
  interruptTurn as interruptTurnService,
  respondToServerRequest,
  sendUserMessage as sendUserMessageService,
  startThread as startThreadService,
  listThreads as listThreadsService,
  resumeThread as resumeThreadService,
  archiveThread as archiveThreadService,
} from "../services/tauri";
import { setupAppServerEvents, type AppServerEventHandlers } from "./appServerEvents";

type ThreadState = {
  activeThreadIdByWorkspace: Record<string, string | null>;
  itemsByThread: Record<string, ConversationItem[]>;
  threadsByWorkspace: Record<string, ThreadSummary[]>;
  forkPreambleByThreadId: Record<string, string | undefined>;
  forkSourceByThreadId: Record<string, ForkSource | undefined>;
  threadStatusById: Record<
    string,
    {
      isProcessing: boolean;
      hasUnread: boolean;
      processingStartedAt: number | null;
      lastDurationMs: number | null;
      activeTurnId: string | null;
      isInterrupting: boolean;
    }
  >;
  approvals: ApprovalRequest[];
};

const MAX_ITEMS_PER_THREAD = 200;
const MAX_ITEM_TEXT = 20000;
const TOOL_OUTPUT_RECENT_ITEMS = 40;
const NO_TRUNCATE_TOOL_TYPES = new Set(["fileChange", "commandExecution"]);
const MAX_FORK_CONTEXT_CHARS = 8000;
const MAX_FORK_MESSAGES = 24;

type ForkSource = {
  sourceWorkspaceId: string;
  sourceThreadId: string;
  sourceThreadName: string;
};

function asString(value: unknown) {
  return typeof value === "string" ? value : value ? String(value) : "";
}

function truncateText(text: string, maxLength = MAX_ITEM_TEXT) {
  if (text.length <= maxLength) {
    return text;
  }
  const sliceLength = Math.max(0, maxLength - 3);
  return `${text.slice(0, sliceLength)}...`;
}

function normalizeItem(item: ConversationItem): ConversationItem {
  if (item.kind === "message") {
    return { ...item, text: truncateText(item.text) };
  }
  if (item.kind === "reasoning") {
    return {
      ...item,
      summary: truncateText(item.summary),
      content: truncateText(item.content),
    };
  }
  if (item.kind === "diff") {
    return { ...item, diff: truncateText(item.diff) };
  }
  if (item.kind === "tool") {
    const isNoTruncateTool = NO_TRUNCATE_TOOL_TYPES.has(item.toolType);
    return {
      ...item,
      title: truncateText(item.title, 200),
      detail: truncateText(item.detail, 2000),
      output:
        item.output && !isNoTruncateTool ? truncateText(item.output) : item.output,
      changes: item.changes
        ? item.changes.map((change) => ({
            ...change,
            diff:
              !isNoTruncateTool && change.diff
                ? truncateText(change.diff)
                : change.diff,
          }))
        : item.changes,
    };
  }
  return item;
}

function prepareThreadItems(items: ConversationItem[]) {
  const normalized = items.map((item) => normalizeItem(item));
  const limited =
    normalized.length > MAX_ITEMS_PER_THREAD
      ? normalized.slice(-MAX_ITEMS_PER_THREAD)
      : normalized;
  const cutoff = Math.max(0, limited.length - TOOL_OUTPUT_RECENT_ITEMS);
  return limited.map((item, index) => {
    if (index >= cutoff || item.kind !== "tool") {
      return item;
    }
    const output = item.output ? truncateText(item.output) : item.output;
    const changes = item.changes
      ? item.changes.map((change) => ({
          ...change,
          diff: change.diff ? truncateText(change.diff) : change.diff,
        }))
      : item.changes;
    if (output === item.output && changes === item.changes) {
      return item;
    }
    return { ...item, output, changes };
  });
}

function buildConversationItem(
  item: Record<string, unknown>
): ConversationItem | null {
  const type = asString(item.type);
  const id = asString(item.id);
  if (!id || !type) {
    return null;
  }
  if (type === "agentMessage" || type === "userMessage") {
    return null;
  }
  if (type === "reasoning") {
    const summary = asString(item.summary ?? "");
    const content = Array.isArray(item.content)
      ? item.content.map((entry) => asString(entry)).join("\n")
      : asString(item.content ?? "");
    return { id, kind: "reasoning", summary, content };
  }
  if (type === "commandExecution") {
    const command = Array.isArray(item.command)
      ? item.command.map((part) => asString(part)).join(" ")
      : asString(item.command ?? "");
    return {
      id,
      kind: "tool",
      toolType: type,
      title: command ? `Command: ${command}` : "Command",
      detail: asString(item.cwd ?? ""),
      status: asString(item.status ?? ""),
      output: asString(item.aggregatedOutput ?? ""),
    };
  }
  if (type === "fileChange") {
    const changes = Array.isArray(item.changes) ? item.changes : [];
    const normalizedChanges = changes
      .map((change) => {
        const path = asString(change?.path ?? "");
        const kind = change?.kind as Record<string, unknown> | string | undefined;
        const kindType =
          typeof kind === "string"
            ? kind
            : typeof kind === "object" && kind
              ? asString((kind as Record<string, unknown>).type ?? "")
              : "";
        const normalizedKind = kindType ? kindType.toLowerCase() : "";
        const diff = asString(change?.diff ?? "");
        return { path, kind: normalizedKind || undefined, diff: diff || undefined };
      })
      .filter((change) => change.path);
    const formattedChanges = normalizedChanges
      .map((change) => {
        const prefix =
          change.kind === "add"
            ? "A"
            : change.kind === "delete"
              ? "D"
              : change.kind
                ? "M"
                : "";
        return [prefix, change.path].filter(Boolean).join(" ");
      })
      .filter(Boolean);
    const paths = formattedChanges.join(", ");
    const diffOutput = normalizedChanges
      .map((change) => change.diff ?? "")
      .filter(Boolean)
      .join("\n\n");
    return {
      id,
      kind: "tool",
      toolType: type,
      title: "File changes",
      detail: paths || "Pending changes",
      status: asString(item.status ?? ""),
      output: diffOutput,
      changes: normalizedChanges,
    };
  }
  if (type === "mcpToolCall") {
    const server = asString(item.server ?? "");
    const tool = asString(item.tool ?? "");
    const args = item.arguments ? JSON.stringify(item.arguments, null, 2) : "";
    return {
      id,
      kind: "tool",
      toolType: type,
      title: `Tool: ${server}${tool ? ` / ${tool}` : ""}`,
      detail: args,
      status: asString(item.status ?? ""),
      output: asString(item.result ?? item.error ?? ""),
    };
  }
  if (type === "webSearch") {
    return {
      id,
      kind: "tool",
      toolType: type,
      title: "Web search",
      detail: asString(item.query ?? ""),
      status: "",
      output: "",
    };
  }
  if (type === "imageView") {
    return {
      id,
      kind: "tool",
      toolType: type,
      title: "Image view",
      detail: asString(item.path ?? ""),
      status: "",
      output: "",
    };
  }
  if (type === "enteredReviewMode" || type === "exitedReviewMode") {
    return {
      id,
      kind: "tool",
      toolType: type,
      title: type === "enteredReviewMode" ? "Review started" : "Review completed",
      detail: asString(item.review ?? ""),
      status: "",
      output: "",
    };
  }
  return null;
}

function userInputsToText(inputs: Array<Record<string, unknown>>) {
  return inputs
    .map((input) => {
      const type = asString(input.type);
      if (type === "text") {
        return asString(input.text);
      }
      if (type === "skill") {
        const name = asString(input.name);
        return name ? `$${name}` : "";
      }
      if (type === "image" || type === "localImage") {
        return "[image]";
      }
      return "";
    })
    .filter(Boolean)
    .join(" ")
    .trim();
}

function buildConversationItemFromThreadItem(
  item: Record<string, unknown>
): ConversationItem | null {
  const type = asString(item.type);
  const id = asString(item.id);
  if (!id || !type) {
    return null;
  }
  if (type === "userMessage") {
    const content = Array.isArray(item.content) ? item.content : [];
    const text = userInputsToText(content);
    return {
      id,
      kind: "message",
      role: "user",
      text: text || "[message]",
    };
  }
  if (type === "agentMessage") {
    return {
      id,
      kind: "message",
      role: "assistant",
      text: asString(item.text),
    };
  }
  if (type === "reasoning") {
    const summary = Array.isArray(item.summary)
      ? item.summary.map((entry) => asString(entry)).join("\n")
      : asString(item.summary ?? "");
    const content = Array.isArray(item.content)
      ? item.content.map((entry) => asString(entry)).join("\n")
      : asString(item.content ?? "");
    return { id, kind: "reasoning", summary, content };
  }
  return buildConversationItem(item);
}

function buildItemsFromThread(thread: Record<string, unknown>) {
  const turns = Array.isArray(thread.turns) ? thread.turns : [];
  const items: ConversationItem[] = [];
  turns.forEach((turn) => {
    const turnItems = Array.isArray((turn as any)?.items) ? (turn as any).items : [];
    turnItems.forEach((item: any) => {
      const converted = buildConversationItemFromThreadItem(item);
      if (converted) {
        items.push(converted);
      }
    });
  });
  return items;
}

function previewThreadName(text: string, fallback: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return fallback;
  }
  return trimmed.length > 38 ? `${trimmed.slice(0, 38)}...` : trimmed;
}

function forkNoticeItem(
  threadId: string,
  source: ForkSource,
): Extract<ConversationItem, { kind: "tool" }> {
  return {
    id: `${threadId}-fork`,
    kind: "tool",
    toolType: "fork",
    title: `Forked from ${source.sourceThreadName}`,
    detail: "Context from the source thread will be included with your next message.",
    status: "",
    output: `Source thread id: ${source.sourceThreadId}`,
  };
}

function buildForkPreamble(source: ForkSource, items: ConversationItem[]): string {
  const messages = items.filter(
    (item): item is Extract<ConversationItem, { kind: "message" }> =>
      item.kind === "message"
  );
  const recent = messages.slice(-MAX_FORK_MESSAGES);

  const segments: string[] = [];
  let total = 0;
  for (let index = recent.length - 1; index >= 0; index -= 1) {
    const message = recent[index];
    const label = message.role === "user" ? "User" : "Assistant";
    const text = message.text.trim() || "[message]";
    const segment = `${label}: ${text}`.trim();
    if (!segment) {
      continue;
    }

    const nextTotal = total + segment.length + (segments.length ? 2 : 0);
    if (nextTotal > MAX_FORK_CONTEXT_CHARS) {
      if (segments.length === 0) {
        segments.push(truncateText(segment, MAX_FORK_CONTEXT_CHARS));
      }
      break;
    }
    segments.push(segment);
    total = nextTotal;
  }

  segments.reverse();
  const context = segments.join("\n\n").trim();
  if (!context) {
    return "";
  }

  return [
    "You are continuing a chat that was forked from another thread.",
    `Source thread: ${source.sourceThreadName} (${source.sourceThreadId}).`,
    "Treat the following as prior conversation context:",
    "",
    context,
  ].join("\n");
}

export type ThreadsStore = {
  activeThreadId: () => string | null;
  setActiveThreadId: (threadId: string | null, workspaceId?: string) => void;
  activeItems: () => ConversationItem[];
  itemsByThread: () => Record<string, ConversationItem[]>;
  approvals: () => ApprovalRequest[];
  threadsByWorkspace: () => Record<string, ThreadSummary[]>;
  threadStatusById: () => ThreadState["threadStatusById"];
  removeThread: (workspaceId: string, threadId: string) => void;
  renameThread: (workspaceId: string, threadId: string, newName: string) => void;
  startThread: () => Promise<string | null>;
  startThreadForWorkspace: (workspaceId: string) => Promise<string | null>;
  forkThreadInWorkspace: (
    workspaceId: string,
    sourceThreadId: string,
    sourceThreadName: string,
  ) => Promise<string | null>;
  forkThreadToWorkspace: (
    sourceWorkspaceId: string,
    sourceThreadId: string,
    sourceThreadName: string,
    destinationWorkspaceId: string,
  ) => Promise<string | null>;
  listThreadsForWorkspace: (workspace: WorkspaceInfo) => Promise<void>;
  sendUserMessage: (
    text: string,
    options?: {
      attachments?: Attachment[];
      approvalPolicy?: ApprovalPolicy;
      accessMode?: AccessMode;
    },
  ) => Promise<void>;
  canStopActiveThread: () => boolean;
  stopActiveThread: () => Promise<void>;
  handleApprovalDecision: (
    request: ApprovalRequest,
    decision: "accept" | "decline"
  ) => Promise<void>;
};

export type ThreadsStoreOptions = {
  activeWorkspace: () => WorkspaceInfo | null;
  activeWorkspaceId: () => string | null;
  onWorkspaceConnected: (id: string) => void;
  onDebug?: (entry: DebugEntry) => void;
  model: () => string | null;
  effort: () => string | null;
  onMessageActivity?: () => void;
  onTurnUsage?: (workspaceId: string, threadId: string, usage: TokenUsage) => void;
};

export function createThreadsStore(options: ThreadsStoreOptions): ThreadsStore {
  const {
    activeWorkspace,
    activeWorkspaceId,
    onWorkspaceConnected,
    onDebug,
    model,
    effort,
    onMessageActivity,
    onTurnUsage,
  } = options;

  const [state, setState] = createStore<ThreadState>({
    activeThreadIdByWorkspace: {},
    itemsByThread: {},
    threadsByWorkspace: {},
    forkPreambleByThreadId: {},
    forkSourceByThreadId: {},
    threadStatusById: {},
    approvals: [],
  });

  const loadedThreads = new Set<string>();

  const activeThreadId = createMemo(() => {
    const wsId = activeWorkspaceId();
    if (!wsId) return null;
    return state.activeThreadIdByWorkspace[wsId] ?? null;
  });

  const activeItems = createMemo(() => {
    const threadId = activeThreadId();
    if (!threadId) return [];
    return state.itemsByThread[threadId] ?? [];
  });

  // Helper functions for state updates
  function setActiveThreadIdAction(workspaceId: string, threadId: string | null) {
    setState(
      produce((s) => {
        s.activeThreadIdByWorkspace[workspaceId] = threadId;
        if (threadId && s.threadStatusById[threadId]) {
          s.threadStatusById[threadId].hasUnread = false;
        }
      })
    );
  }

  function ensureThread(workspaceId: string, threadId: string) {
    setState(
      produce((s) => {
        const list = s.threadsByWorkspace[workspaceId] ?? [];
        if (list.some((thread) => thread.id === threadId)) {
          return;
        }
        const thread: ThreadSummary = {
          id: threadId,
          name: `Agent ${list.length + 1}`,
        };
        s.threadsByWorkspace[workspaceId] = [thread, ...list];
        s.threadStatusById[threadId] = {
          isProcessing: false,
          hasUnread: false,
          processingStartedAt: null,
          lastDurationMs: null,
          activeTurnId: null,
          isInterrupting: false,
        };
        if (!s.activeThreadIdByWorkspace[workspaceId]) {
          s.activeThreadIdByWorkspace[workspaceId] = threadId;
        }
      })
    );
  }

  function removeThreadAction(workspaceId: string, threadId: string) {
    setState(
      produce((s) => {
        const list = s.threadsByWorkspace[workspaceId] ?? [];
        const filtered = list.filter((thread) => thread.id !== threadId);
        const nextActive =
          s.activeThreadIdByWorkspace[workspaceId] === threadId
            ? filtered[0]?.id ?? null
            : s.activeThreadIdByWorkspace[workspaceId] ?? null;
        s.threadsByWorkspace[workspaceId] = filtered;
        delete s.itemsByThread[threadId];
        delete s.forkPreambleByThreadId[threadId];
        delete s.forkSourceByThreadId[threadId];
        delete s.threadStatusById[threadId];
        s.activeThreadIdByWorkspace[workspaceId] = nextActive;
      })
    );
  }

  function markProcessing(threadId: string, isProcessing: boolean) {
    setState(
      produce((s) => {
        const existing = s.threadStatusById[threadId];
        if (!existing) {
          s.threadStatusById[threadId] = {
            isProcessing,
            hasUnread: false,
            processingStartedAt: isProcessing ? Date.now() : null,
            lastDurationMs: null,
            activeTurnId: null,
            isInterrupting: false,
          };
          return;
        }

        if (isProcessing) {
          existing.isProcessing = true;
          existing.processingStartedAt = Date.now();
          existing.lastDurationMs = null;
          existing.isInterrupting = false;
        } else {
          const startedAt = existing.processingStartedAt;
          existing.isProcessing = false;
          existing.processingStartedAt = null;
          existing.activeTurnId = null;
          existing.isInterrupting = false;
          existing.lastDurationMs =
            typeof startedAt === "number" ? Date.now() - startedAt : null;
        }
      })
    );
  }

  function markTurnStarted(threadId: string, turnId: string) {
    setState(
      produce((s) => {
        const status = s.threadStatusById[threadId];
        if (!status) {
          s.threadStatusById[threadId] = {
            isProcessing: true,
            hasUnread: false,
            processingStartedAt: Date.now(),
            lastDurationMs: null,
            activeTurnId: turnId,
            isInterrupting: false,
          };
          return;
        }

        status.isProcessing = true;
        status.processingStartedAt = Date.now();
        status.lastDurationMs = null;
        status.activeTurnId = turnId;
        status.isInterrupting = false;
      }),
    );
  }

  function markTurnCompleted(threadId: string, turnId: string | null) {
    setState(
      produce((s) => {
        const status = s.threadStatusById[threadId];
        if (!status) {
          return;
        }

        if (turnId && status.activeTurnId && status.activeTurnId !== turnId) {
          return;
        }

        const startedAt = status.processingStartedAt;
        status.isProcessing = false;
        status.processingStartedAt = null;
        status.activeTurnId = null;
        status.isInterrupting = false;
        status.lastDurationMs =
          typeof startedAt === "number" ? Date.now() - startedAt : null;
      }),
    );
  }

  function markUnread(threadId: string, hasUnread: boolean) {
    setState(
      produce((s) => {
        const existing = s.threadStatusById[threadId];
        if (!existing) {
          s.threadStatusById[threadId] = {
            isProcessing: false,
            hasUnread,
            processingStartedAt: null,
            lastDurationMs: null,
            activeTurnId: null,
            isInterrupting: false,
          };
          return;
        }
        existing.hasUnread = hasUnread;
      })
    );
  }

  function addUserMessage(threadId: string, text: string) {
    const message: ConversationItem = {
      id: `${Date.now()}-user`,
      kind: "message",
      role: "user",
      text,
    };
    setState(
      produce((s) => {
        if (!s.itemsByThread[threadId]) {
          s.itemsByThread[threadId] = [];
        }
        s.itemsByThread[threadId].push(message);
        s.itemsByThread[threadId] = prepareThreadItems(s.itemsByThread[threadId]);
      })
    );
  }

  function setThreadName(workspaceId: string, threadId: string, name: string) {
    setState(
      produce((s) => {
        const list = s.threadsByWorkspace[workspaceId] ?? [];
        const index = list.findIndex((t) => t.id === threadId);
        if (index >= 0) {
          s.threadsByWorkspace[workspaceId][index].name = name;
        }
      })
    );
  }

  function appendAgentDelta(threadId: string, itemId: string, delta: string) {
    setState(
      produce((s) => {
        if (!s.itemsByThread[threadId]) {
          s.itemsByThread[threadId] = [];
        }
        const list = s.itemsByThread[threadId];
        const index = list.findIndex((msg) => msg.id === itemId);
        if (index >= 0 && list[index].kind === "message") {
          (list[index] as any).text += delta;
        } else {
          list.push({
            id: itemId,
            kind: "message",
            role: "assistant",
            text: delta,
          });
        }
        s.itemsByThread[threadId] = prepareThreadItems(list);
      })
    );
  }

  function completeAgentMessage(threadId: string, itemId: string, text: string) {
    setState(
      produce((s) => {
        if (!s.itemsByThread[threadId]) {
          s.itemsByThread[threadId] = [];
        }
        const list = s.itemsByThread[threadId];
        const index = list.findIndex((msg) => msg.id === itemId);
        if (index >= 0 && list[index].kind === "message") {
          if (text) {
            (list[index] as any).text = text;
          }
        } else {
          list.push({
            id: itemId,
            kind: "message",
            role: "assistant",
            text,
          });
        }
        s.itemsByThread[threadId] = prepareThreadItems(list);
      })
    );
  }

  function upsertItemAction(threadId: string, item: ConversationItem) {
    setState(
      produce((s) => {
        if (!s.itemsByThread[threadId]) {
          s.itemsByThread[threadId] = [];
        }
        const list = s.itemsByThread[threadId];
        const index = list.findIndex((entry) => entry.id === item.id);
        if (index === -1) {
          list.push(item);
        } else {
          Object.assign(list[index], item);
        }
        s.itemsByThread[threadId] = prepareThreadItems(list);
      })
    );
  }

  function setThreadItems(threadId: string, items: ConversationItem[]) {
    setState(
      produce((s) => {
        s.itemsByThread[threadId] = prepareThreadItems(items);
      })
    );
  }

  function setTurnDiff(threadId: string, diff: string) {
    setState(
      produce((s) => {
        if (!s.itemsByThread[threadId]) {
          s.itemsByThread[threadId] = [];
        }
        const list = s.itemsByThread[threadId];
        const existingIndex = list.findIndex(
          (item) => item.kind === "diff" && item.id === `${threadId}-diff`
        );
        const nextItem: ConversationItem = {
          id: `${threadId}-diff`,
          kind: "diff",
          title: "Turn diff",
          diff,
        };
        if (existingIndex === -1) {
          list.push(nextItem);
        } else {
          list[existingIndex] = nextItem;
        }
        s.itemsByThread[threadId] = prepareThreadItems(list);
      })
    );
  }

  function appendReasoningSummary(threadId: string, itemId: string, delta: string) {
    setState(
      produce((s) => {
        if (!s.itemsByThread[threadId]) {
          s.itemsByThread[threadId] = [];
        }
        const list = s.itemsByThread[threadId];
        const index = list.findIndex((entry) => entry.id === itemId);
        if (index >= 0 && list[index].kind === "reasoning") {
          (list[index] as any).summary += delta;
        } else if (index === -1) {
          list.push({
            id: itemId,
            kind: "reasoning",
            summary: delta,
            content: "",
          });
        }
        s.itemsByThread[threadId] = prepareThreadItems(list);
      })
    );
  }

  function appendReasoningContent(threadId: string, itemId: string, delta: string) {
    setState(
      produce((s) => {
        if (!s.itemsByThread[threadId]) {
          s.itemsByThread[threadId] = [];
        }
        const list = s.itemsByThread[threadId];
        const index = list.findIndex((entry) => entry.id === itemId);
        if (index >= 0 && list[index].kind === "reasoning") {
          (list[index] as any).content += delta;
        } else if (index === -1) {
          list.push({
            id: itemId,
            kind: "reasoning",
            summary: "",
            content: delta,
          });
        }
        s.itemsByThread[threadId] = prepareThreadItems(list);
      })
    );
  }

  function appendToolOutput(threadId: string, itemId: string, delta: string) {
    setState(
      produce((s) => {
        const list = s.itemsByThread[threadId];
        if (!list) return;
        const index = list.findIndex((entry) => entry.id === itemId);
        if (index >= 0 && list[index].kind === "tool") {
          const existing = list[index] as any;
          existing.output = (existing.output ?? "") + delta;
          s.itemsByThread[threadId] = prepareThreadItems(list);
        }
      })
    );
  }

  function addApproval(approval: ApprovalRequest) {
    setState(
      produce((s) => {
        s.approvals.push(approval);
      })
    );
  }

  function removeApproval(requestId: number) {
    setState(
      produce((s) => {
        s.approvals = s.approvals.filter((item) => item.request_id !== requestId);
      })
    );
  }

  function setThreads(workspaceId: string, threads: ThreadSummary[]) {
    setState(
      produce((s) => {
        s.threadsByWorkspace[workspaceId] = threads;
      })
    );
  }

  // Setup event handlers
  const handlers = (): AppServerEventHandlers => ({
    onWorkspaceConnected,
    onApprovalRequest: addApproval,
    onAppServerEvent: (event) => {
      const method = String(event.message?.method ?? "");
      const inferredSource = method === "codex/stderr" ? "stderr" : "event";
      onDebug?.({
        id: `${Date.now()}-server-event`,
        timestamp: Date.now(),
        source: inferredSource,
        label: method || "event",
        payload: event,
      });
    },
    onAgentMessageDelta: ({ workspaceId, threadId, itemId, delta }) => {
      ensureThread(workspaceId, threadId);
      appendAgentDelta(threadId, itemId, delta);
    },
    onAgentMessageCompleted: ({ workspaceId, threadId, itemId, text }) => {
      ensureThread(workspaceId, threadId);
      completeAgentMessage(threadId, itemId, text);
      markProcessing(threadId, false);
      try {
        onMessageActivity?.();
      } catch {
        // Ignore refresh errors
      }
      if (threadId !== activeThreadId()) {
        markUnread(threadId, true);
      }
    },
    onItemStarted: (workspaceId, threadId, item) => {
      ensureThread(workspaceId, threadId);
      const converted = buildConversationItem(item);
      if (converted) {
        upsertItemAction(threadId, converted);
      }
      try {
        onMessageActivity?.();
      } catch {
        // Ignore refresh errors
      }
    },
    onItemCompleted: (workspaceId, threadId, item) => {
      ensureThread(workspaceId, threadId);
      const converted = buildConversationItem(item);
      if (converted) {
        upsertItemAction(threadId, converted);
      }
      try {
        onMessageActivity?.();
      } catch {
        // Ignore refresh errors
      }
    },
    onReasoningSummaryDelta: (_workspaceId, threadId, itemId, delta) => {
      appendReasoningSummary(threadId, itemId, delta);
    },
    onReasoningTextDelta: (_workspaceId, threadId, itemId, delta) => {
      appendReasoningContent(threadId, itemId, delta);
    },
    onCommandOutputDelta: (_workspaceId, threadId, itemId, delta) => {
      appendToolOutput(threadId, itemId, delta);
      try {
        onMessageActivity?.();
      } catch {
        // Ignore refresh errors
      }
    },
    onFileChangeOutputDelta: (_workspaceId, threadId, itemId, delta) => {
      appendToolOutput(threadId, itemId, delta);
      try {
        onMessageActivity?.();
      } catch {
        // Ignore refresh errors
      }
    },
    onTurnStarted: (workspaceId, threadId, turnId) => {
      ensureThread(workspaceId, threadId);
      markTurnStarted(threadId, turnId);
    },
    onTurnCompleted: (_workspaceId, threadId, turnId) => {
      markTurnCompleted(threadId, turnId ?? null);
    },
    onTurnDiffUpdated: (_workspaceId, threadId, diff) => {
      setTurnDiff(threadId, diff);
    },
    onTurnUsage: (workspaceId, threadId, usage) => {
      onTurnUsage?.(workspaceId, threadId, usage);
    },
  });

  setupAppServerEvents(handlers);

  // API methods
  async function startThreadForWorkspace(workspaceId: string): Promise<string | null> {
    onDebug?.({
      id: `${Date.now()}-client-thread-start`,
      timestamp: Date.now(),
      source: "client",
      label: "thread/start",
      payload: { workspaceId },
    });
    try {
      const response = await startThreadService(workspaceId);
      onDebug?.({
        id: `${Date.now()}-server-thread-start`,
        timestamp: Date.now(),
        source: "server",
        label: "thread/start response",
        payload: response,
      });
      const thread = response.result?.thread ?? response.thread;
      const threadId = String(thread?.id ?? "");
      if (threadId) {
        ensureThread(workspaceId, threadId);
        setActiveThreadIdAction(workspaceId, threadId);
        loadedThreads.add(threadId);
        return threadId;
      }
      return null;
    } catch (error) {
      onDebug?.({
        id: `${Date.now()}-client-thread-start-error`,
        timestamp: Date.now(),
        source: "error",
        label: "thread/start error",
        payload: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async function forkThreadInWorkspace(
    workspaceId: string,
    sourceThreadId: string,
    sourceThreadName: string,
  ): Promise<string | null> {
    ensureThread(workspaceId, sourceThreadId);
    await resumeThreadForWorkspace(workspaceId, sourceThreadId);

    const source: ForkSource = {
      sourceWorkspaceId: workspaceId,
      sourceThreadId,
      sourceThreadName,
    };
    const preamble = buildForkPreamble(source, state.itemsByThread[sourceThreadId] ?? []);

    const forkedThreadId = await startThreadForWorkspace(workspaceId);
    if (!forkedThreadId) {
      return null;
    }

    setState(
      produce((s) => {
        s.forkSourceByThreadId[forkedThreadId] = source;
        s.forkPreambleByThreadId[forkedThreadId] = preamble || undefined;
      }),
    );

    setThreadItems(forkedThreadId, [forkNoticeItem(forkedThreadId, source)]);
    setThreadName(
      workspaceId,
      forkedThreadId,
      previewThreadName(`Fork: ${sourceThreadName}`, `Agent ${forkedThreadId.slice(0, 4)}`),
    );

    return forkedThreadId;
  }

  async function forkThreadToWorkspace(
    sourceWorkspaceId: string,
    sourceThreadId: string,
    sourceThreadName: string,
    destinationWorkspaceId: string,
  ): Promise<string | null> {
    ensureThread(sourceWorkspaceId, sourceThreadId);
    await resumeThreadForWorkspace(sourceWorkspaceId, sourceThreadId);

    const source: ForkSource = {
      sourceWorkspaceId,
      sourceThreadId,
      sourceThreadName,
    };
    const preamble = buildForkPreamble(source, state.itemsByThread[sourceThreadId] ?? []);

    const forkedThreadId = await startThreadForWorkspace(destinationWorkspaceId);
    if (!forkedThreadId) {
      return null;
    }

    setState(
      produce((s) => {
        s.forkSourceByThreadId[forkedThreadId] = source;
        s.forkPreambleByThreadId[forkedThreadId] = preamble || undefined;
      }),
    );

    setThreadItems(forkedThreadId, [forkNoticeItem(forkedThreadId, source)]);
    setThreadName(
      destinationWorkspaceId,
      forkedThreadId,
      previewThreadName(`Fork: ${sourceThreadName}`, `Agent ${forkedThreadId.slice(0, 4)}`),
    );

    return forkedThreadId;
  }

  async function startThread(): Promise<string | null> {
    const wsId = activeWorkspaceId();
    if (!wsId) return null;
    return startThreadForWorkspace(wsId);
  }

  async function resumeThreadForWorkspace(
    workspaceId: string,
    threadId: string,
    force = false
  ): Promise<string | null> {
    if (!threadId) return null;
    if (!force && loadedThreads.has(threadId)) return threadId;

    onDebug?.({
      id: `${Date.now()}-client-thread-resume`,
      timestamp: Date.now(),
      source: "client",
      label: "thread/resume",
      payload: { workspaceId, threadId },
    });
    try {
      const response = await resumeThreadService(workspaceId, threadId);
      onDebug?.({
        id: `${Date.now()}-server-thread-resume`,
        timestamp: Date.now(),
        source: "server",
        label: "thread/resume response",
        payload: response,
      });
      const thread = response.result?.thread ?? response.thread;
      if (thread) {
        const items = buildItemsFromThread(thread);
        if (items.length > 0) {
          const forkSource = state.forkSourceByThreadId[threadId];
          const nextItems = forkSource
            ? [forkNoticeItem(threadId, forkSource), ...items]
            : items;
          setThreadItems(threadId, nextItems);
        }
        const preview = asString(thread?.preview ?? "");
        if (preview) {
          setThreadName(
            workspaceId,
            threadId,
            previewThreadName(preview, `Agent ${threadId.slice(0, 4)}`)
          );
        }
      }
      loadedThreads.add(threadId);
      return threadId;
    } catch (error) {
      onDebug?.({
        id: `${Date.now()}-client-thread-resume-error`,
        timestamp: Date.now(),
        source: "error",
        label: "thread/resume error",
        payload: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async function listThreadsForWorkspace(workspace: WorkspaceInfo): Promise<void> {
    onDebug?.({
      id: `${Date.now()}-client-thread-list`,
      timestamp: Date.now(),
      source: "client",
      label: "thread/list",
      payload: { workspaceId: workspace.id, path: workspace.path },
    });
    try {
      const allThreads: any[] = [];
      let cursor: string | null = null;
      do {
        const response = await listThreadsService(workspace.id, cursor, 50);
        onDebug?.({
          id: `${Date.now()}-server-thread-list`,
          timestamp: Date.now(),
          source: "server",
          label: "thread/list response",
          payload: response,
        });
        const result = response.result ?? response;
        const data = Array.isArray(result?.data) ? result.data : [];
        const nextCursor = result?.nextCursor ?? result?.next_cursor ?? null;
        allThreads.push(...data);
        cursor = nextCursor;
      } while (cursor);

      const matching = allThreads.filter(
        (thread) => String(thread?.cwd ?? "") === workspace.path
      );
      matching.sort((a, b) => {
        const aCreated = Number(a?.createdAt ?? a?.created_at ?? 0);
        const bCreated = Number(b?.createdAt ?? b?.created_at ?? 0);
        return bCreated - aCreated;
      });
      const summaries = matching
        .map((thread, index) => {
          const preview = asString(thread?.preview ?? "").trim();
          const fallbackName = `Agent ${index + 1}`;
          const name =
            preview.length > 0
              ? preview.length > 38
                ? `${preview.slice(0, 38)}...`
                : preview
              : fallbackName;
          return { id: String(thread?.id ?? ""), name };
        })
        .filter((entry) => entry.id);

      const unique = new Map<string, ThreadSummary>();
      summaries.forEach((thread) => {
        if (!unique.has(thread.id)) {
          unique.set(thread.id, thread);
        }
      });
      setThreads(workspace.id, Array.from(unique.values()));
    } catch (error) {
      onDebug?.({
        id: `${Date.now()}-client-thread-list-error`,
        timestamp: Date.now(),
        source: "error",
        label: "thread/list error",
        payload: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function sendUserMessage(
    text: string,
    options?: {
      attachments?: Attachment[];
      approvalPolicy?: ApprovalPolicy;
      accessMode?: AccessMode;
    },
  ): Promise<void> {
    const workspace = activeWorkspace();
    if (!workspace) return;

    let threadId = activeThreadId();
    if (!threadId) {
      threadId = await startThread();
      if (!threadId) return;
    } else if (!loadedThreads.has(threadId)) {
      await resumeThreadForWorkspace(workspace.id, threadId);
    }

    const messageText = text.trim();
    const attachments = options?.attachments ?? [];
    if (!messageText && attachments.length === 0) {
      return;
    }

    const displayText =
      messageText ||
      (attachments.length > 1 ? `[image] ×${attachments.length}` : "[image]");

    addUserMessage(threadId, displayText);

    if (messageText) {
      setThreadName(
        workspace.id,
        threadId,
        previewThreadName(messageText, `Agent ${threadId.slice(0, 4)}`),
      );
    }
    markProcessing(threadId, true);
    try {
      onMessageActivity?.();
    } catch {
      // Ignore refresh errors
    }
    onDebug?.({
      id: `${Date.now()}-client-turn-start`,
      timestamp: Date.now(),
      source: "client",
      label: "turn/start",
      payload: {
        workspaceId: workspace.id,
        threadId,
        text: messageText,
        attachments: attachments.length ? attachments.map((a) => a.name) : null,
        approvalPolicy: options?.approvalPolicy ?? null,
        accessMode: options?.accessMode ?? null,
        hasForkContext: !!state.forkPreambleByThreadId[threadId],
        model: model(),
        effort: effort(),
      },
    });
    try {
      const forkPreamble = state.forkPreambleByThreadId[threadId] ?? "";
      const serverText = forkPreamble
        ? `${forkPreamble}\n\n---\n\nNEW USER MESSAGE:\n${displayText}`
        : messageText;
      const response = await sendUserMessageService(
        workspace.id,
        threadId,
        serverText,
        {
          model: model(),
          effort: effort(),
          attachments,
          approvalPolicy: options?.approvalPolicy,
          accessMode: options?.accessMode,
        },
      );
      onDebug?.({
        id: `${Date.now()}-server-turn-start`,
        timestamp: Date.now(),
        source: "server",
        label: "turn/start response",
        payload: response,
      });
      if (forkPreamble) {
        setState(
          produce((s) => {
            delete s.forkPreambleByThreadId[threadId];
          }),
        );
        const source = state.forkSourceByThreadId[threadId];
        if (source) {
          upsertItemAction(threadId, {
            ...forkNoticeItem(threadId, source),
            detail: "Fork context included in the first message.",
          });
        }
      }
    } catch (error) {
      onDebug?.({
        id: `${Date.now()}-client-turn-start-error`,
        timestamp: Date.now(),
        source: "error",
        label: "turn/start error",
        payload: error instanceof Error ? error.message : String(error),
      });
      markProcessing(threadId, false);
      throw error;
    }
  }

  const canStopActiveThread = () => {
    const workspaceId = activeWorkspaceId();
    const threadId = activeThreadId();
    if (!workspaceId || !threadId) {
      return false;
    }

    const status = state.threadStatusById[threadId];
    return (
      !!status?.isProcessing &&
      !!status.activeTurnId &&
      !status.isInterrupting
    );
  };

  const stopActiveThread = async () => {
    const workspaceId = activeWorkspaceId();
    const threadId = activeThreadId();
    if (!workspaceId || !threadId) {
      return;
    }

    const status = state.threadStatusById[threadId];
    const turnId = status?.activeTurnId ?? null;
    if (!turnId || status?.isInterrupting) {
      return;
    }

    setState(
      produce((s) => {
        const target = s.threadStatusById[threadId];
        if (target) {
          target.isInterrupting = true;
        }
      }),
    );

    onDebug?.({
      id: `${Date.now()}-client-turn-interrupt`,
      timestamp: Date.now(),
      source: "client",
      label: "turn/interrupt",
      payload: { workspaceId, threadId, turnId },
    });

    try {
      await interruptTurnService(workspaceId, threadId, turnId);
    } catch (error) {
      onDebug?.({
        id: `${Date.now()}-client-turn-interrupt-error`,
        timestamp: Date.now(),
        source: "error",
        label: "turn/interrupt error",
        payload: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      setState(
        produce((s) => {
          const target = s.threadStatusById[threadId];
          if (target) {
            target.isInterrupting = false;
          }
        }),
      );
    }
  };

  async function handleApprovalDecision(
    request: ApprovalRequest,
    decision: "accept" | "decline"
  ): Promise<void> {
    await respondToServerRequest(request.workspace_id, request.request_id, decision);
    removeApproval(request.request_id);
  }

  function setActiveThreadId(threadId: string | null, workspaceId?: string): void {
    const targetId = workspaceId ?? activeWorkspaceId();
    if (!targetId) return;
    setActiveThreadIdAction(targetId, threadId);
    if (threadId) {
      resumeThreadForWorkspace(targetId, threadId, true);
    }
  }

  function removeThread(workspaceId: string, threadId: string): void {
    removeThreadAction(workspaceId, threadId);
    (async () => {
      try {
        await archiveThreadService(workspaceId, threadId);
      } catch (error) {
        onDebug?.({
          id: `${Date.now()}-client-thread-archive-error`,
          timestamp: Date.now(),
          source: "error",
          label: "thread/archive error",
          payload: error instanceof Error ? error.message : String(error),
        });
      }
    })();
  }

  function renameThread(workspaceId: string, threadId: string, newName: string): void {
    const trimmed = newName.trim();
    if (!trimmed) return;

    onDebug?.({
      id: `${Date.now()}-client-rename-thread`,
      timestamp: Date.now(),
      source: "client",
      label: "thread/rename",
      payload: { workspaceId, threadId, newName: trimmed },
    });

    setState("threadsByWorkspace", workspaceId, (threads) =>
      threads?.map((thread) =>
        thread.id === threadId ? { ...thread, name: trimmed } : thread,
      ),
    );
  }

  return {
    activeThreadId,
    setActiveThreadId,
    activeItems,
    itemsByThread: () => state.itemsByThread,
    approvals: () => state.approvals,
    threadsByWorkspace: () => state.threadsByWorkspace,
    threadStatusById: () => state.threadStatusById,
    removeThread,
    renameThread,
    startThread,
    startThreadForWorkspace,
    forkThreadInWorkspace,
    forkThreadToWorkspace,
    listThreadsForWorkspace,
    sendUserMessage,
    canStopActiveThread,
    stopActiveThread,
    handleApprovalDecision,
  };
}
