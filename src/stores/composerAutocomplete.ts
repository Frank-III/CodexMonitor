import { createSignal, createMemo, createEffect, on } from "solid-js";
import type { WorkspacePathKind } from "../types";

export type AutocompleteItem = {
  id: string;
  label: string;
  description?: string;
  insertText?: string;
  kind?: WorkspacePathKind;
};

export type AutocompleteTrigger = {
  trigger: string;
  items: AutocompleteItem[];
  startOfLine?: boolean;
  onQueryChange?: (query: string) => void;
};

type AutocompleteRange = {
  start: number;
  end: number;
};

const whitespaceRegex = /\s/;

function getTokenStart(text: string, cursor: number) {
  let index = cursor - 1;
  while (index >= 0 && !whitespaceRegex.test(text[index])) {
    index -= 1;
  }
  return index + 1;
}

function isStartOfLine(text: string, index: number) {
  if (index <= 0) return true;
  const lineStart = text.lastIndexOf("\n", index - 1) + 1;
  for (let i = lineStart; i < index; i += 1) {
    if (!whitespaceRegex.test(text[i])) {
      return false;
    }
  }
  return true;
}

function resolveAutocompleteState(
  text: string,
  cursor: number,
  triggers: AutocompleteTrigger[]
) {
  const tokenStart = getTokenStart(text, cursor);
  if (tokenStart >= text.length) {
    return { active: false, trigger: null, query: "", range: null };
  }
  const triggerChar = text[tokenStart];
  const matched = triggers.find((entry) => entry.trigger === triggerChar);
  if (!matched) {
    return { active: false, trigger: null, query: "", range: null };
  }
  // Check startOfLine constraint
  if (matched.startOfLine && !isStartOfLine(text, tokenStart)) {
    return { active: false, trigger: null, query: "", range: null };
  }
  const query = text.slice(tokenStart + 1, cursor);
  return {
    active: true,
    trigger: triggerChar,
    query,
    range: { start: tokenStart + 1, end: cursor } as AutocompleteRange,
  };
}

function filterItems(items: AutocompleteItem[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return items.slice();
  }
  return items.filter((item) => {
    const label = item.label.toLowerCase();
    const description = item.description?.toLowerCase() ?? "";
    const id = item.id.toLowerCase();
    return (
      label.includes(normalized) ||
      description.includes(normalized) ||
      id.includes(normalized)
    );
  });
}

function sortItems(items: AutocompleteItem[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return items;
  }

  const stripLabel = (raw: string) => raw.replace(/\/$/, "");
  const fileStem = (raw: string) => stripLabel(raw).replace(/\.[^.]+$/, "");

  const rank = (item: AutocompleteItem) => {
    const label = item.label.toLowerCase();
    const labelStripped = stripLabel(label);
    const stem = fileStem(label);
    const id = item.id.toLowerCase();
    const description = item.description?.toLowerCase() ?? "";

    if (stem === normalized || labelStripped === normalized || id === normalized) return 0;
    if (
      labelStripped.startsWith(normalized) ||
      stem.startsWith(normalized)
    )
      return 1;
    if (id.startsWith(normalized)) return 2;
    if (
      labelStripped.includes(normalized) ||
      stem.includes(normalized)
    )
      return 3;
    if (description.includes(normalized) || id.includes(normalized)) return 4;
    return 5;
  };

  return items.slice().sort((a, b) => {
    const rankA = rank(a);
    const rankB = rank(b);
    if (rankA !== rankB) {
      return rankA - rankB;
    }
    return a.label.localeCompare(b.label);
  });
}

type CreateComposerAutocompleteOptions = {
  text: () => string;
  selectionStart: () => number | undefined;
  triggers: () => AutocompleteTrigger[];
  maxResults?: number;
};

export function createComposerAutocomplete(options: CreateComposerAutocompleteOptions) {
  const maxResults = options.maxResults ?? 8;
  const [highlightIndex, setHighlightIndex] = createSignal(0);
  const [dismissed, setDismissed] = createSignal(false);

  const state = createMemo(() => {
    const cursor = options.selectionStart();
    if (cursor === undefined || cursor < 0) {
      return { active: false, trigger: null, query: "", range: null };
    }
    return resolveAutocompleteState(options.text(), cursor, options.triggers());
  });

  const matches = createMemo(() => {
    const s = state();
    if (!s.active || !s.trigger) {
      return [];
    }
    const source = options.triggers().find((entry) => entry.trigger === s.trigger);
    if (!source) {
      return [];
    }
    const filtered = filterItems(source.items, s.query);
    const sorted = sortItems(filtered, s.query);
    return sorted.slice(0, Math.max(0, maxResults));
  });

  const active = createMemo(() => state().active && matches().length > 0 && !dismissed());
  const query = createMemo(() => state().query);
  const range = createMemo(() => state().range);

  createEffect(
    on([() => state().trigger, () => state().query, () => state().active], ([trigger, q, isActive]) => {
      if (!isActive || !trigger) {
        return;
      }
      const triggerConfig = options
        .triggers()
        .find((entry) => entry.trigger === trigger);
      triggerConfig?.onQueryChange?.(q);
    }),
  );

  createEffect(
    on([() => state().trigger, () => state().query, () => state().active], ([, , isActive]) => {
      if (!isActive) {
        return;
      }
      setDismissed(false);
      setHighlightIndex(0);
    }),
  );

  createEffect(() => {
    const m = matches();
    setHighlightIndex((prev) => {
      if (m.length === 0) return 0;
      return Math.min(prev, m.length - 1);
    });
  });

  function moveHighlight(delta: number) {
    const m = matches();
    if (m.length === 0) return;
    setHighlightIndex((prev) => {
      const next = (prev + delta + m.length) % m.length;
      return next;
    });
  }

  function close() {
    setHighlightIndex(0);
    setDismissed(true);
  }

  function reset() {
    setHighlightIndex(0);
    setDismissed(false);
  }

  const currentTrigger = createMemo(() => state().trigger);

  return {
    active,
    query,
    range,
    matches,
    highlightIndex,
    setHighlightIndex,
    moveHighlight,
    close,
    reset,
    currentTrigger,
  };
}
