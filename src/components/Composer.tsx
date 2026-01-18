import {
  createSignal,
  createMemo,
  createEffect,
  onCleanup,
  onMount,
  For,
  Show,
  type Accessor,
  type JSX,
} from "solid-js";
import { createStore } from "solid-js/store";
import { ComposerQueue } from "./ComposerQueue";
import { createComposerAutocomplete, type AutocompleteItem } from "../stores/composerAutocomplete";
import { createWorkspaceFilesAutocomplete } from "../stores/workspaceFilesAutocomplete";
import type {
  AccessMode,
  Attachment,
  ApprovalPolicy,
  QueuedMessage,
  WorkspaceDirTreeEntry,
} from "../types";
import type { WorkspacePathPreviewStore } from "../stores/workspacePathPreview";
import { createTextareaCaretMeasurer } from "../utils/textareaCaret";

const MAX_HISTORY = 100;
const HISTORY_STORAGE_KEY = "codex-monitor-prompt-history";

function loadHistory(): string[] {
  try {
    const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed.slice(0, MAX_HISTORY);
    }
  } catch {}
  return [];
}

function saveHistory(entries: string[]) {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY)));
  } catch {}
}

type ComposerProps = {
  value: Accessor<string>;
  onChange: (value: string) => void;
  onSend: () => void | Promise<void>;
  attachments: Accessor<Attachment[]>;
  onAttachmentsChange: (value: Attachment[]) => void;
  onTextareaRef?: (el: HTMLTextAreaElement) => void;
  onShellCommand?: (command: string) => void | Promise<void>;
  onSlashCommand?: (command: string, args: string) => void | Promise<void>;
  workspaceId?: Accessor<string | null>;
  models: Accessor<{ id: string; displayName: string; model: string }[]>;
  selectedModelId: Accessor<string | null>;
  onSelectModel: (id: string | null) => void;
  reasoningOptions: Accessor<string[]>;
  selectedEffort: Accessor<string | null>;
  onSelectEffort: (effort: string | null) => void;
  accessMode?: Accessor<AccessMode>;
  onAccessModeChange?: (mode: AccessMode) => void;
  approvalPolicy?: Accessor<ApprovalPolicy>;
  onApprovalPolicyChange?: (policy: ApprovalPolicy) => void;
  skills: Accessor<{ name: string; description?: string }[]>;
  onSelectSkill: (name: string) => void;
  pathPreview?: WorkspacePathPreviewStore;
  queuedMessages?: Accessor<QueuedMessage[]>;
  onRemoveQueuedMessage?: (id: string) => void;
  onClearQueuedMessages?: () => void;
  disabled?: boolean;
  onStop?: () => void | Promise<void>;
  canStop?: boolean;
  onEditPreviousMessage?: () => void | Promise<void>;
  lastUserMessage?: Accessor<string | null>;
  steerEnabled?: Accessor<boolean>;
  isProcessing?: Accessor<boolean>;
  onQueue?: () => void | Promise<void>;
};

const SLASH_COMMANDS: AutocompleteItem[] = [
  { id: "prompts", label: "prompts", description: "Browse prompts library", insertText: "prompts" },
  { id: "review", label: "review", description: "Review recent changes", insertText: "review" },
  { id: "compact", label: "compact", description: "Compact conversation history", insertText: "compact" },
  { id: "clear", label: "clear", description: "Clear conversation", insertText: "clear" },
  { id: "help", label: "help", description: "Show available commands", insertText: "help" },
];

const TEXTAREA_AUTOSIZE_MAX_HEIGHT_PX = 240;

function autosizeTextarea(textarea: HTMLTextAreaElement) {
  textarea.style.height = "auto";
  const scrollHeight = textarea.scrollHeight;
  const nextHeight = Math.min(scrollHeight, TEXTAREA_AUTOSIZE_MAX_HEIGHT_PX);
  textarea.style.height = `${nextHeight}px`;
  textarea.style.overflowY =
    scrollHeight > TEXTAREA_AUTOSIZE_MAX_HEIGHT_PX ? "auto" : "hidden";
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 4h6l4 4v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linejoin="round"
      />
      <path
        d="M14 4v4h4"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linejoin="round"
      />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linejoin="round"
      />
    </svg>
  );
}

function renderTreeRows(entries: WorkspaceDirTreeEntry[], depth: number) {
  const rows: JSX.Element[] = [];
  for (const entry of entries) {
    rows.push(
      <div class="file-mention-tree-row" style={{ "padding-left": `${depth * 14}px` }}>
        <span class="file-mention-tree-icon" aria-hidden>
          <Show when={entry.kind === "dir"} fallback={<FileIcon />}>
            <FolderIcon />
          </Show>
        </span>
        <span class="file-mention-tree-name">
          {entry.name}
          <Show when={entry.kind === "dir"}>/</Show>
        </span>
      </div>,
    );

    if (entry.kind === "dir" && entry.children && entry.children.length > 0) {
      rows.push(...renderTreeRows(entry.children, depth + 1));
    }
  }
  return rows;
}

export function Composer(props: ComposerProps) {
  const [selectionStart, setSelectionStart] = createSignal<number>();
  const [isDragging, setIsDragging] = createSignal(false);
  const [localApproval, setLocalApproval] = createSignal<ApprovalPolicy>("on-request");
  const [localAccessMode, setLocalAccessMode] = createSignal<AccessMode>("current");
  const [textareaScrollTop, setTextareaScrollTop] = createSignal(0);
  const [textareaScrollLeft, setTextareaScrollLeft] = createSignal(0);
  const [viewportSize, setViewportSize] = createSignal({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  let textareaRef: HTMLTextAreaElement | undefined;
  let composerRef: HTMLElement | undefined;
  let suggestionsListRef: HTMLDivElement | undefined;
  let caretMeasurer:
    | ReturnType<typeof createTextareaCaretMeasurer>
    | undefined;

  // Prompt history state
  const [historyStore, setHistoryStore] = createStore<{
    entries: string[];
    index: number;
    savedDraft: string | null;
  }>({
    entries: [],
    index: -1,
    savedDraft: null,
  });

  onMount(() => {
    setHistoryStore("entries", loadHistory());
  });

  const addToHistory = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    
    const current = historyStore.entries;
    if (current[0] === trimmed) return;
    
    const next = [trimmed, ...current.filter((e) => e !== trimmed)].slice(0, MAX_HISTORY);
    setHistoryStore("entries", next);
    saveHistory(next);
  };

  const navigateHistory = (direction: "up" | "down"): boolean => {
    const entries = historyStore.entries;
    const current = historyStore.index;
    const currentText = props.value();

    if (direction === "up") {
      if (entries.length === 0) return false;
      
      if (current === -1) {
        setHistoryStore("savedDraft", currentText);
        setHistoryStore("index", 0);
        props.onChange(entries[0]);
        return true;
      }
      
      if (current < entries.length - 1) {
        const next = current + 1;
        setHistoryStore("index", next);
        props.onChange(entries[next]);
        return true;
      }
      return false;
    }

    if (current > 0) {
      const next = current - 1;
      setHistoryStore("index", next);
      props.onChange(entries[next]);
      return true;
    }
    
    if (current === 0) {
      setHistoryStore("index", -1);
      const saved = historyStore.savedDraft;
      props.onChange(saved ?? "");
      setHistoryStore("savedDraft", null);
      return true;
    }

    return false;
  };

  const resetHistoryNavigation = () => {
    if (historyStore.index >= 0) {
      setHistoryStore("index", -1);
      setHistoryStore("savedDraft", null);
    }
  };

  const approvalPolicy = () => props.approvalPolicy?.() ?? localApproval();
  const accessMode = () => props.accessMode?.() ?? localAccessMode();

  const handleApprovalChange = (policy: ApprovalPolicy) => {
    if (props.onApprovalPolicyChange) {
      props.onApprovalPolicyChange(policy);
      return;
    }
    setLocalApproval(policy);
  };

  const handleAccessModeChange = (mode: AccessMode) => {
    if (props.onAccessModeChange) {
      props.onAccessModeChange(mode);
      return;
    }
    setLocalAccessMode(mode);
  };

  const fileAutocomplete = createWorkspaceFilesAutocomplete({
    workspaceId: () => props.workspaceId?.() ?? null,
  });

  const skillItems = createMemo(() =>
    props.skills().map((skill) => ({
      id: skill.name,
      label: skill.name,
      description: skill.description,
      insertText: skill.name,
    }))
  );

  const triggers = createMemo(() => [
    { trigger: "$", items: skillItems() },
    { trigger: "@", items: fileAutocomplete.items(), onQueryChange: fileAutocomplete.onQueryChange },
    { trigger: "/", items: SLASH_COMMANDS, startOfLine: true },
  ]);

  const autocomplete = createComposerAutocomplete({
    text: props.value,
    selectionStart,
    triggers,
  });

  const selectedAutocompleteItem = createMemo(() => {
    if (!autocomplete.active()) return null;
    const matches = autocomplete.matches();
    if (matches.length === 0) return null;
    const highlighted = matches[autocomplete.highlightIndex()];
    return highlighted ?? matches[0] ?? null;
  });

  const selectedFolderPath = createMemo(() => {
    const item = selectedAutocompleteItem();
    if (!item) return null;
    if (!props.pathPreview) return null;
    if (autocomplete.currentTrigger?.() !== "@") return null;
    if (item.kind !== "dir") return null;
    return item.id;
  });

  createEffect(() => {
    const path = selectedFolderPath();
    const preview = props.pathPreview;
    if (!path || !preview) return;
    preview.ensureDir(path);
  });

  const folderPreview = createMemo(() => {
    const path = selectedFolderPath();
    const preview = props.pathPreview;
    if (!path || !preview) return null;
    const state = preview.state();
    return state.dirs[path] ?? { status: "idle", data: null, error: null };
  });

  createEffect(() => {
    props.value();
    requestAnimationFrame(() => {
      if (!textareaRef) return;
      autosizeTextarea(textareaRef);
    });
  });

  createEffect(() => {
    const handleResize = () =>
      setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", handleResize);
    onCleanup(() => window.removeEventListener("resize", handleResize));
  });

  createEffect(() => {
    if (!autocomplete.active()) return;
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (composerRef?.contains(target)) return;
      autocomplete.close();
    };
    document.addEventListener("mousedown", handleMouseDown);
    onCleanup(() => document.removeEventListener("mousedown", handleMouseDown));
  });

  const autocompletePortalStyle = createMemo(() => {
    if (!autocomplete.active()) return undefined;
    if (!textareaRef || !caretMeasurer) return undefined;

    textareaScrollTop();
    textareaScrollLeft();
    const { width: viewportWidth, height: viewportHeight } = viewportSize();

    const range = autocomplete.range();
    if (!range) return undefined;

    const triggerIndex = Math.max(0, range.start - 1);
    const caret = caretMeasurer.measure(triggerIndex);

    const safeMargin = 10;
    const gap = 8;
    const caretOffsetBelow = 20;
    const desiredListWidth = 320;
    const previewWidth = selectedFolderPath() ? 280 : 0;

    const desiredWidth = desiredListWidth + previewWidth;
    const maxWidth = Math.max(180, viewportWidth - safeMargin * 2);
    const dropdownWidth = Math.min(desiredWidth, maxWidth);

    const availableBelow =
      viewportHeight - (caret.top + caretOffsetBelow) - safeMargin;
    const availableAbove = caret.top - safeMargin;
    const requestedHeight = 240;

    const shouldPlaceAbove =
      (availableAbove >= requestedHeight && availableBelow < requestedHeight) ||
      (availableAbove > availableBelow && availableAbove >= requestedHeight);
    const placement: "above" | "below" = shouldPlaceAbove ? "above" : "below";

    const leftOffset = -4;
    let left = caret.left + leftOffset;
    if (left + dropdownWidth > viewportWidth - safeMargin) {
      left = viewportWidth - dropdownWidth - safeMargin;
    }
    if (left < safeMargin) {
      left = safeMargin;
    }

    const top = placement === "above" ? caret.top - gap : caret.top + gap + caretOffsetBelow;
    const placementTransform = placement === "above" ? "translateY(-100%)" : "translateY(0)";
    const enterTranslateY = placement === "above" ? "-6px" : "6px";
    const transformOrigin = placement === "above" ? "bottom left" : "top left";

    const availableOnSide = placement === "above" ? availableAbove : availableBelow;
    const maxHeight = Math.max(80, Math.min(requestedHeight, availableOnSide - gap));

    return {
      top: `${top}px`,
      left: `${left}px`,
      width: `${dropdownWidth}px`,
      transform: placementTransform,
      "--composer-suggestions-max-height": `${maxHeight}px`,
      "--composer-suggestions-enter-translate-y": enterTranslateY,
      "--composer-suggestions-transform-origin": transformOrigin,
    } as Record<string, string>;
  });

  createEffect(() => {
    if (!autocomplete.active()) return;
    const list = suggestionsListRef;
    if (!list) return;

    const index = autocomplete.highlightIndex();
    requestAnimationFrame(() => {
      const target = list.querySelector(
        `[data-suggestion-index="${index}"]`,
      ) as HTMLElement | null;
      target?.scrollIntoView({ block: "nearest" });
    });
  });

  function applyAutocomplete(item: AutocompleteItem) {
    const r = autocomplete.range();
    if (!r) return;

    const text = props.value();
    const before = text.slice(0, r.start);
    const after = text.slice(r.end);
    const insert = item.insertText ?? item.label;
    const needsSpace = after.length === 0 || !/^\s/.test(after);
    const nextText = `${before}${insert}${needsSpace ? " " : ""}${after}`;
    props.onChange(nextText);
    autocomplete.close();

    requestAnimationFrame(() => {
      if (!textareaRef) return;
      const cursor = before.length + insert.length + (needsSpace ? 1 : 0);
      textareaRef.focus();
      textareaRef.setSelectionRange(cursor, cursor);
      setSelectionStart(cursor);
    });
  }

  // Image handling
  function addImageFromFile(file: File): Promise<void> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = String(reader.result ?? "").split(",")[1] ?? "";
        const attachment: Attachment = {
          id: crypto.randomUUID(),
          type: "image",
          name: file.name,
          data: base64,
          mimeType: file.type,
        };
        props.onAttachmentsChange([...props.attachments(), attachment]);
        resolve();
      };
      reader.onerror = () => {
        reject(reader.error ?? new Error("Failed to read image file"));
      };
      reader.readAsDataURL(file);
    });
  }

  function removeAttachment(id: string) {
    props.onAttachmentsChange(props.attachments().filter((a) => a.id !== id));
  }

  let fileInputRef: HTMLInputElement | undefined;

  function handlePickImage() {
    fileInputRef?.click();
  }

  function handleFileInputChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const files = input.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      if (file.type.startsWith("image/")) {
        void addImageFromFile(file).catch(() => {});
      }
    }
    input.value = ""; // Reset for re-selection
  }

  // Drag and drop
  function handleDragEnter(e: DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    if (e.relatedTarget && composerRef?.contains(e.relatedTarget as Node)) return;
    setIsDragging(false);
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
  }

  async function handleDrop(e: DragEvent) {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer?.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      if (file.type.startsWith("image/")) {
        void addImageFromFile(file).catch(() => {});
      }
    }
  }

  // Keyboard handling
  function handleKeyDown(event: KeyboardEvent) {
    if (props.disabled) return;

    // Escape to edit previous message (when input is empty)
    if (event.key === "Escape" && !autocomplete.active()) {
      if (!props.value().trim() && props.onEditPreviousMessage) {
        event.preventDefault();
        void Promise.resolve(props.onEditPreviousMessage()).catch((err) => {
          console.error("Failed to edit previous message:", err);
        });
        return;
      }
    }

    if (autocomplete.active()) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        autocomplete.moveHighlight(1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        autocomplete.moveHighlight(-1);
        return;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        const matches = autocomplete.matches();
        const selected = matches[autocomplete.highlightIndex()] ?? matches[0];
        if (selected) {
          applyAutocomplete(selected);
        }
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        const matches = autocomplete.matches();
        const selected = matches[autocomplete.highlightIndex()] ?? matches[0];
        if (selected) {
          applyAutocomplete(selected);
        }
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        autocomplete.close();
        return;
      }
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
      return;
    }

    // History navigation with Arrow Up/Down
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      
      const textarea = textareaRef;
      if (!textarea) return;
      
      const text = props.value();
      const cursorPos = textarea.selectionStart;
      const hasNewlines = text.includes("\n");
      const isEmpty = text.trim() === "";
      const atStart = cursorPos === 0;
      const atEnd = cursorPos === text.length;
      const inHistory = historyStore.index >= 0;
      
      const allowUp = isEmpty || atStart || (!hasNewlines && !inHistory);
      const allowDown = isEmpty || atEnd || (!hasNewlines && inHistory);
      
      if (event.key === "ArrowUp" && allowUp) {
        if (navigateHistory("up")) {
          event.preventDefault();
          requestAnimationFrame(() => {
            if (textareaRef) {
              textareaRef.setSelectionRange(0, 0);
            }
          });
        }
        return;
      }
      
      if (event.key === "ArrowDown" && allowDown) {
        if (navigateHistory("down")) {
          event.preventDefault();
          requestAnimationFrame(() => {
            if (textareaRef) {
              const len = props.value().length;
              textareaRef.setSelectionRange(len, len);
            }
          });
        }
        return;
      }
    }

    const steerEnabled = props.steerEnabled?.() ?? false;
    const isProcessing = props.isProcessing?.() ?? false;
    if (
      event.key === "Tab" &&
      !event.shiftKey &&
      steerEnabled &&
      isProcessing &&
      !autocomplete.active()
    ) {
      event.preventDefault();
      void Promise.resolve(props.onQueue?.()).catch((err) => {
        console.error("Failed to queue message:", err);
      });
    }
  }

  function handleSend() {
    const text = props.value().trim();

    // Handle ! shell prefix
    if (text.startsWith("!") && props.onShellCommand) {
      const command = text.slice(1).trim();
      if (command) {
        addToHistory(props.value());
        resetHistoryNavigation();
        void Promise.resolve(props.onShellCommand(command)).catch((err) => {
          console.error("Failed to run shell command:", err);
        });
        props.onChange("");
        return;
      }
    }

    // Handle / slash commands
    if (text.startsWith("/") && props.onSlashCommand) {
      const parts = text.slice(1).split(/\s+/);
      const cmd = parts[0];
      const args = parts.slice(1).join(" ");
      if (cmd) {
        addToHistory(props.value());
        resetHistoryNavigation();
        void Promise.resolve(props.onSlashCommand(cmd, args)).catch((err) => {
          console.error("Failed to run slash command:", err);
        });
        props.onChange("");
        return;
      }
    }

    // Regular message
    if (text || props.attachments().length > 0) {
      addToHistory(props.value());
      resetHistoryNavigation();
      void Promise.resolve(props.onSend()).catch((err) => {
        console.error("Failed to send message:", err);
      });
    }
  }

  // Paste handler for images
  function handlePaste(e: ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          void addImageFromFile(file).catch(() => {});
        }
      }
    }
  }

  return (
    <footer
      ref={composerRef}
      class="relative flex flex-col gap-2 border-t border-border-subtle bg-surface-base/50 px-6 py-3 pb-5"
      classList={{ "pointer-events-none opacity-50": !!props.disabled, "outline-2 outline-dashed outline-accent/60 -outline-offset-2": isDragging() }}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: "none" }}
        onChange={handleFileInputChange}
      />

      <Show when={props.queuedMessages && props.onRemoveQueuedMessage}>
        <ComposerQueue
          items={() => props.queuedMessages?.() ?? []}
          onRemove={(id) => props.onRemoveQueuedMessage?.(id)}
          onClear={props.onClearQueuedMessages}
        />
      </Show>

      <Show when={isDragging()}>
        <div class="absolute inset-0 z-10 flex items-center justify-center bg-accent/10 text-sm font-medium text-accent">
          <span>Drop images here</span>
        </div>
      </Show>

      <Show when={props.attachments().length > 0}>
        <div class="flex flex-wrap gap-2 pb-2">
          <For each={props.attachments()}>
            {(attachment) => (
              <div class="relative flex max-w-[120px] items-center gap-1.5 rounded-md bg-white/6 px-2 py-1">
                <Show
                  when={attachment.type === "image" && attachment.data}
                  fallback={<span class="truncate text-[11px] text-text-muted">{attachment.name}</span>}
                >
                  <img
                    src={`data:${attachment.mimeType};base64,${attachment.data}`}
                    alt={attachment.name}
                    class="h-12 w-12 rounded object-cover"
                  />
                </Show>
                <button
                  type="button"
                  class="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-danger text-white hover:bg-red-500"
                  onClick={() => removeAttachment(attachment.id)}
                  aria-label={`Remove ${attachment.name}`}
                >
                  <svg class="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
                  </svg>
                </button>
              </div>
            )}
          </For>
        </div>
      </Show>

      <div class="flex items-center gap-2">
        <button
          type="button"
          class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/6 text-text-subtle transition-colors hover:bg-white/10 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
          onClick={handlePickImage}
          disabled={props.disabled}
          aria-label="Attach image"
        >
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
        <div class="relative flex-1">
          <textarea
            ref={(el) => {
              textareaRef = el;
              caretMeasurer?.dispose();
              caretMeasurer = createTextareaCaretMeasurer(el);
              onCleanup(() => caretMeasurer?.dispose());
              props.onTextareaRef?.(el);
              autosizeTextarea(el);
            }}
            class="h-10 max-h-60 min-h-10 w-full resize-none overflow-y-hidden border-none bg-transparent px-1 py-2 text-sm text-text-primary placeholder:text-text-weak focus:outline-none"
            placeholder={
              props.disabled
                ? "Review in progress. Chat will re-enable when it completes."
                : "Ask Codex... ($ skills, @ files, / commands, ! shell)"
            }
            value={props.value()}
            onInput={(event) => {
              props.onChange(event.currentTarget.value);
              setSelectionStart(event.currentTarget.selectionStart);
              autosizeTextarea(event.currentTarget);
            }}
            onSelect={(event) => {
              setSelectionStart(event.currentTarget.selectionStart);
            }}
            onScroll={(event) => {
              setTextareaScrollTop(event.currentTarget.scrollTop);
              setTextareaScrollLeft(event.currentTarget.scrollLeft);
            }}
            disabled={props.disabled}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
          />
          <div
            class="composer-suggestions-portal"
            data-state={autocomplete.active() ? "open" : "closed"}
            aria-hidden={!autocomplete.active()}
            style={autocompletePortalStyle()}
          >
            <div class="composer-suggestions" role="listbox">
              <div class="composer-suggestions-list" ref={suggestionsListRef}>
                <For each={autocomplete.matches()}>
                  {(item, index) => (
                    <button
                      type="button"
                      class="composer-suggestion"
                      classList={{ "is-active": index() === autocomplete.highlightIndex() }}
                      role="option"
                      aria-selected={index() === autocomplete.highlightIndex()}
                      data-suggestion-index={index()}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => applyAutocomplete(item)}
                      onMouseEnter={() => autocomplete.setHighlightIndex(index())}
                    >
                      <span class="composer-suggestion-title">
                        <Show when={autocomplete.currentTrigger?.() === "@"}>
                          <span class="composer-suggestion-icon" aria-hidden>
                            <Show when={item.kind === "dir"} fallback={<FileIcon />}>
                              <FolderIcon />
                            </Show>
                          </span>
                        </Show>
                        {autocomplete.currentTrigger?.() === "$" ? "$" : ""}
                        {autocomplete.currentTrigger?.() === "@" ? "@" : ""}
                        {autocomplete.currentTrigger?.() === "/" ? "/" : ""}
                        {item.label}
                      </span>
                      <Show when={item.description}>
                        <span class="composer-suggestion-description">{item.description}</span>
                      </Show>
                    </button>
                  )}
                </For>
              </div>
              <div
                class="composer-suggestions-preview"
                data-state={selectedFolderPath() ? "open" : "closed"}
                aria-hidden={!selectedFolderPath()}
              >
                <div class="composer-suggestions-preview-inner">
                  <Show when={selectedFolderPath()}>
                    {(path) => (
                      <>
                        <div class="composer-suggestions-preview-title">
                          Folder preview
                        </div>
                        <div class="composer-suggestions-preview-path file-mention-tree">
                          <For each={path().split("/").filter(Boolean)}>
                            {(part, index) => (
                              <div
                                class="file-mention-tree-row"
                                style={{ "padding-left": `${index() * 14}px` }}
                              >
                                <span class="file-mention-tree-icon" aria-hidden>
                                  <FolderIcon />
                                </span>
                                <span class="file-mention-tree-name">{part}</span>
                              </div>
                            )}
                          </For>
                        </div>
                        <div class="composer-suggestions-preview-divider" />
                        <Show
                          when={folderPreview()?.status === "ready" && folderPreview()?.data}
                          fallback={
                            <Show
                              when={folderPreview()?.status === "error"}
                              fallback={<div class="composer-suggestions-preview-muted">Loading…</div>}
                            >
                              <div class="composer-suggestions-preview-error">
                                {folderPreview()?.error ?? "Failed to load folder"}
                              </div>
                            </Show>
                          }
                        >
                          <div class="file-mention-tree">
                            {renderTreeRows(folderPreview()!.data!.entries, 0)}
                          </div>
                          <Show when={folderPreview()!.data!.truncated}>
                            <div class="composer-suggestions-preview-muted">… (truncated)</div>
                          </Show>
                        </Show>
                      </>
                    )}
                  </Show>
                </div>
              </div>
            </div>
          </div>
        </div>
        <Show when={props.onStop && props.canStop}>
          <button
            type="button"
            class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/8 transition-colors hover:bg-danger/20 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={props.onStop}
            disabled={props.disabled || !props.canStop}
            aria-label="Stop"
          >
            <span class="h-3 w-3 rounded-sm bg-danger" aria-hidden />
          </button>
        </Show>
        <button
          type="button"
          class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-accent text-white transition-colors hover:bg-accent/80 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
          onClick={handleSend}
          disabled={props.disabled}
          aria-label="Send"
        >
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M12 5l6 6m-6-6L6 11m6-6v14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>

      {/* Meta bar */}
      <div class="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-2.5">
        <ComposerSelect
          icon={
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M7 8V6a5 5 0 0 1 10 0v2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
              <rect x="4.5" y="8" width="15" height="11" rx="3" stroke="currentColor" stroke-width="1.4" />
              <circle cx="9" cy="13" r="1" fill="currentColor" />
              <circle cx="15" cy="13" r="1" fill="currentColor" />
              <path d="M9 16h6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
            </svg>
          }
          label="Model"
          value={props.selectedModelId() ?? ""}
          onChange={(value) => props.onSelectModel(value)}
          width="w-[100px]"
        >
          <Show when={props.models().length === 0}>
            <option value="">No models</option>
          </Show>
          <For each={props.models()}>
            {(model) => <option value={model.id}>{model.displayName || model.model}</option>}
          </For>
        </ComposerSelect>

        <ComposerSelect
          icon={
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M12 4l7 3v5c0 4.5-3 7.5-7 8-4-0.5-7-3.5-7-8V7l7-3z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" />
              <path d="M12 11v4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
              <path d="M12 8.2h.01" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
            </svg>
          }
          label="Access mode"
          value={accessMode()}
          onChange={(value) => handleAccessModeChange(value as AccessMode)}
          width="w-[90px]"
        >
          <option value="read-only">Read-only</option>
          <option value="current">Current</option>
          <option value="full-access">Full access</option>
        </ComposerSelect>

        <ComposerSelect
          icon={
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M8.5 4.5a3.5 3.5 0 0 0-3.46 4.03A4 4 0 0 0 6 16.5h2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
              <path d="M15.5 4.5a3.5 3.5 0 0 1 3.46 4.03A4 4 0 0 1 18 16.5h-2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
              <path d="M9 12h6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
              <path d="M12 12v6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
            </svg>
          }
          label="Thinking mode"
          value={props.selectedEffort() ?? ""}
          onChange={(value) => props.onSelectEffort(value)}
          width="w-[60px]"
        >
          <Show when={props.reasoningOptions().length === 0}>
            <option value="">Default</option>
          </Show>
          <For each={props.reasoningOptions()}>
            {(effort) => <option value={effort}>{effort}</option>}
          </For>
        </ComposerSelect>

        <ComposerSelect
          icon={
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M12 4l7 3v5c0 4.5-3 7.5-7 8-4-0.5-7-3.5-7-8V7l7-3z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" />
              <path d="M9.5 12.5l1.8 1.8 3.7-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          }
          label="Approval"
          value={approvalPolicy()}
          onChange={(value) => handleApprovalChange(value as ApprovalPolicy)}
          width="w-[85px]"
        >
          <option value="on-request">On request</option>
          <option value="never">Never</option>
          <option value="unless-allow-listed">Unless trusted</option>
        </ComposerSelect>
      </div>
    </footer>
  );
}

function ComposerSelect(props: {
  icon: any;
  label: string;
  value: string;
  onChange: (value: string) => void;
  width: string;
  children: any;
}) {
  return (
    <div class="flex items-center gap-1.5 rounded-md bg-surface-raised-base px-2 py-1 hover:bg-surface-raised-base-hover transition-colors">
      <span class="flex size-4 text-icon-base shrink-0" aria-hidden>
        {props.icon}
      </span>
      <select
        class="min-w-0 cursor-pointer border-none bg-transparent text-12-regular text-text-base focus:text-text-strong focus:outline-none appearance-none pr-4"
        style={{
          "background-image": "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.5)' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
          "background-position": "right 0 center",
          "background-repeat": "no-repeat",
        }}
        aria-label={props.label}
        value={props.value}
        onChange={(e) => props.onChange(e.currentTarget.value)}
      >
        {props.children}
      </select>
    </div>
  );
}
