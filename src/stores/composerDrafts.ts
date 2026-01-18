import { createMemo, createSignal, type Accessor } from "solid-js";
import type { Attachment } from "../types";

type DraftEntry = {
  text: string;
  attachments: Attachment[];
};

const emptyDraft: DraftEntry = { text: "", attachments: [] };

export type ComposerDraftsStore = {
  key: () => string;
  text: () => string;
  attachments: () => Attachment[];
  setText: (next: string | ((prev: string) => string)) => void;
  setAttachments: (next: Attachment[] | ((prev: Attachment[]) => Attachment[])) => void;
  clear: () => void;
  clearKey: (key: string) => void;
};

function resolveDraftKey(threadId: string | null, workspaceId: string | null) {
  if (threadId) {
    return threadId;
  }
  return `draft-${workspaceId ?? "none"}`;
}

export function createComposerDraftsStore(options: {
  activeThreadId: Accessor<string | null>;
  activeWorkspaceId: Accessor<string | null>;
}): ComposerDraftsStore {
  const [draftsByKey, setDraftsByKey] = createSignal<Record<string, DraftEntry>>({});

  const key = createMemo(() => resolveDraftKey(options.activeThreadId(), options.activeWorkspaceId()));

  const entry = createMemo(() => draftsByKey()[key()] ?? emptyDraft);
  const text = createMemo(() => entry().text);
  const attachments = createMemo(() => entry().attachments);

  const updateEntry = (next: DraftEntry) => {
    const draftKey = key();
    if (!next.text && next.attachments.length === 0) {
      setDraftsByKey((prev) => {
        if (!(draftKey in prev)) {
          return prev;
        }
        const { [draftKey]: _, ...rest } = prev;
        return rest;
      });
      return;
    }
    setDraftsByKey((prev) => ({ ...prev, [draftKey]: next }));
  };

  const setText: ComposerDraftsStore["setText"] = (next) => {
    const current = entry();
    const value = typeof next === "function" ? next(current.text) : next;
    updateEntry({ ...current, text: value });
  };

  const setAttachments: ComposerDraftsStore["setAttachments"] = (next) => {
    const current = entry();
    const value = typeof next === "function" ? next(current.attachments) : next;
    updateEntry({ ...current, attachments: value });
  };

  const clear = () => {
    updateEntry(emptyDraft);
  };

  const clearKey = (targetKey: string) => {
    setDraftsByKey((prev) => {
      if (!(targetKey in prev)) {
        return prev;
      }
      const { [targetKey]: _, ...rest } = prev;
      return rest;
    });
  };

  return {
    key,
    text,
    attachments,
    setText,
    setAttachments,
    clear,
    clearKey,
  };
}

