import { For, Show, createMemo, createSignal } from "solid-js";
import type { PromptOption } from "../types";

type PromptsBrowserProps = {
  open: boolean;
  prompts: PromptOption[];
  isLoading: boolean;
  error: string | null;
  query: string;
  onQueryChange: (next: string) => void;
  onRefresh: () => void | Promise<void>;
  onClose: () => void;
  onInsert: (prompt: PromptOption) => void | Promise<void>;
};

export function PromptsBrowser(props: PromptsBrowserProps) {
  return (
    <Show when={props.open}>
      <PromptsBrowserContent {...props} />
    </Show>
  );
}

function clampPreview(value: string, maxLength: number) {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength)}…`;
}

async function copyToClipboard(text: string): Promise<boolean> {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(trimmed);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = trimmed;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  }
}

function PromptsBrowserContent(props: PromptsBrowserProps) {
  const [selectedId, setSelectedId] = createSignal<string | null>(null);
  const [copyOk, setCopyOk] = createSignal(false);

  const normalizedQuery = createMemo(() => props.query.trim().toLowerCase());
  const filteredPrompts = createMemo(() => {
    const query = normalizedQuery();
    if (!query) {
      return props.prompts;
    }
    return props.prompts.filter((prompt) => {
      const haystack = [
        prompt.name,
        prompt.description ?? "",
        prompt.prompt ?? "",
      ]
        .join("\n")
        .toLowerCase();
      return haystack.includes(query);
    });
  });

  const selectedPrompt = createMemo(() => {
    const prompts = filteredPrompts();
    if (prompts.length === 0) {
      return null;
    }
    const currentId = selectedId();
    return prompts.find((prompt) => prompt.id === currentId) ?? prompts[0] ?? null;
  });

  const handleInsert = async () => {
    const prompt = selectedPrompt();
    if (!prompt) {
      return;
    }
    await props.onInsert(prompt);
  };

  const handleCopy = async () => {
    const prompt = selectedPrompt();
    if (!prompt?.prompt) {
      return;
    }
    const ok = await copyToClipboard(prompt.prompt);
    setCopyOk(ok);
    if (ok) {
      window.setTimeout(() => setCopyOk(false), 900);
    }
  };

  return (
    <div
      class="absolute inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.45)] backdrop-blur-[12px] backdrop-saturate-[120%] [-webkit-app-region:no-drag]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) {
          props.onClose();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          props.onClose();
        }
      }}
    >
      <div
        class="w-[calc(100vw-40px)] max-w-[980px] max-h-[calc(100vh-80px)] overflow-hidden rounded-[14px] border border-white/10 bg-[rgba(18,22,32,0.98)] shadow-[0_18px_36px_rgba(0,0,0,0.35)]"
        role="dialog"
        aria-modal="true"
        aria-label="Prompts browser"
      >
        <div class="flex items-center justify-between gap-3 border-b border-white/10 px-[14px] py-[10px]">
          <div class="text-[12px] font-bold uppercase tracking-[0.1em] text-white/70">
            Prompts
          </div>
          <div class="flex items-center gap-[10px]">
            <input
              class="w-[min(420px,60vw)] rounded-[10px] border border-white/15 bg-white/5 px-[10px] py-[8px] text-[13px] text-white/90 outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-400/20"
              type="text"
              value={props.query}
              placeholder="Search prompts…"
              spellcheck={false}
              onInput={(event) => props.onQueryChange(event.currentTarget.value)}
              autofocus
            />
            <button
              type="button"
              class="secondary"
              onClick={() => void Promise.resolve(props.onRefresh()).catch(() => {})}
              disabled={props.isLoading}
              title="Refresh prompts"
            >
              {props.isLoading ? "Refreshing…" : "Refresh"}
            </button>
            <button
              type="button"
              class="ghost icon-button"
              onClick={props.onClose}
              aria-label="Close prompts"
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linecap="round"
                />
              </svg>
            </button>
          </div>
        </div>

        <Show when={props.error}>
          <div class="mx-[14px] mt-[12px] whitespace-pre-wrap break-words rounded-[10px] border border-red-300/20 bg-red-300/10 p-[10px] text-[12px] text-red-200">
            {props.error}
          </div>
        </Show>

        <div class="grid grid-cols-[minmax(220px,320px)_1fr] gap-0">
          <div class="border-r border-white/10">
            <div class="max-h-[calc(100vh-220px)] overflow-auto px-[10px] py-[10px]">
              <Show
                when={!props.isLoading}
                fallback={<div class="px-[6px] py-[12px] text-[12px] text-white/60">Loading…</div>}
              >
                <Show
                  when={filteredPrompts().length}
                  fallback={
                    <div class="px-[6px] py-[12px] text-[12px] text-white/50">
                      No prompts found.
                    </div>
                  }
                >
                  <For each={filteredPrompts()}>
                    {(prompt) => (
                      <button
                        type="button"
                        class="mb-[6px] w-full rounded-[12px] border border-transparent bg-transparent px-[10px] py-[8px] text-left text-[12px] text-white/80 transition hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-indigo-400/30"
                        classList={{
                          "border-indigo-400/40 bg-indigo-400/10":
                            selectedPrompt()?.id === prompt.id,
                        }}
                        onClick={() => setSelectedId(prompt.id)}
                      >
                        <div class="font-semibold text-white/90">{prompt.name}</div>
                        <Show when={prompt.description}>
                          <div class="mt-[2px] text-[11px] leading-snug text-white/55">
                            {clampPreview(prompt.description ?? "", 120)}
                          </div>
                        </Show>
                      </button>
                    )}
                  </For>
                </Show>
              </Show>
            </div>
          </div>

          <div class="min-h-[260px] px-[14px] py-[12px]">
            <Show
              when={selectedPrompt()}
              fallback={
                <div class="px-[2px] py-[12px] text-[12px] text-white/60">
                  Select a prompt to preview.
                </div>
              }
            >
              {(prompt) => (
                <>
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <div class="truncate text-[14px] font-semibold text-white/90">
                        {prompt().name}
                      </div>
                      <Show when={prompt().description}>
                        <div class="mt-[4px] text-[12px] leading-relaxed text-white/60">
                          {prompt().description}
                        </div>
                      </Show>
                    </div>
                    <div class="flex shrink-0 items-center gap-[10px]">
                      <button
                        type="button"
                        class="secondary"
                        onClick={handleCopy}
                        disabled={!prompt().prompt}
                        title="Copy prompt text"
                      >
                        <Show when={copyOk()} fallback="Copy">
                          Copied
                        </Show>
                      </button>
                      <button
                        type="button"
                        class="primary"
                        onClick={() => void handleInsert().catch(() => {})}
                        disabled={!prompt()}
                      >
                        Insert
                      </button>
                    </div>
                  </div>

                  <Show
                    when={prompt().prompt}
                    fallback={
                      <div class="mt-[12px] rounded-[12px] border border-white/10 bg-black/20 p-[12px] text-[12px] text-white/60">
                        This prompt has no body text attached by the server.
                      </div>
                    }
                  >
                    <pre class="mt-[12px] max-h-[calc(100vh-320px)] overflow-auto whitespace-pre-wrap break-words rounded-[12px] border border-white/10 bg-black/20 p-[12px] text-[11px] leading-relaxed text-white/75">
                      {prompt().prompt}
                    </pre>
                  </Show>
                </>
              )}
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
}

