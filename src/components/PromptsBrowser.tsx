import { Dialog as KobalteDialog } from "@kobalte/core/dialog";
import { For, Show, createMemo, createSignal } from "solid-js";
import type { PromptOption } from "../types";
import { Button, Dialog, TextField } from "../ui";

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
    <KobalteDialog
      modal
      open={true}
      onOpenChange={(open) => {
        if (open) return;
        props.onClose();
      }}
    >
      <KobalteDialog.Portal>
        <KobalteDialog.Overlay data-component="dialog-overlay" />
        <Dialog title="Prompts" style={{ "--dialog-width": "980px", "--dialog-height": "720px" }}>
          <div class="flex h-full min-h-0 flex-col">
            <div class="flex items-center gap-2 px-6 pb-4">
              <div class="flex-1">
                <TextField
                  label="Search prompts"
                  hideLabel
                  variant="ghost"
                  type="text"
                  value={props.query}
                  onChange={props.onQueryChange}
                  placeholder="Search prompts…"
                  spellcheck={false}
                  autofocus
                />
              </div>
              <Button
                variant="secondary"
                onClick={() => void Promise.resolve(props.onRefresh()).catch(() => {})}
                disabled={props.isLoading}
              >
                {props.isLoading ? "Refreshing…" : "Refresh"}
              </Button>
            </div>

            <Show when={props.error}>
              {(error) => (
                <div class="px-6 pb-4">
                  <div class="rounded-md bg-surface-critical-weak px-3 py-2 text-13-regular text-text-on-critical-weak">
                    {error()}
                  </div>
                </div>
              )}
            </Show>

            <div class="grid min-h-0 flex-1 grid-cols-[minmax(220px,320px)_1fr] border-t border-border-weaker-base">
              <div class="min-h-0 border-r border-border-weaker-base">
                <div class="h-full overflow-y-auto p-3">
                  <Show
                    when={!props.isLoading}
                    fallback={<div class="px-2 py-3 text-13-regular text-text-weak">Loading…</div>}
                  >
                    <Show
                      when={filteredPrompts().length}
                      fallback={<div class="px-2 py-3 text-13-regular text-text-weak">No prompts found.</div>}
                    >
                      <For each={filteredPrompts()}>
                        {(prompt) => (
                          <button
                            type="button"
                            class="mb-2 w-full rounded-md border border-transparent px-3 py-2 text-left text-13-regular text-text-base transition hover:bg-surface-raised-base-hover focus:outline-none focus:ring-2 focus:ring-border-interactive-focus/40"
                            classList={{
                              "border-border-interactive-base bg-surface-interactive-weak": selectedPrompt()?.id === prompt.id,
                            }}
                            onClick={() => setSelectedId(prompt.id)}
                          >
                            <div class="font-medium text-text-strong">{prompt.name}</div>
                            <Show when={prompt.description}>
                              <div class="mt-1 text-12-regular text-text-weak">
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

              <div class="min-h-0 overflow-y-auto p-4">
                <Show
                  when={selectedPrompt()}
                  fallback={<div class="text-13-regular text-text-weak">Select a prompt to preview.</div>}
                >
                  {(prompt) => (
                    <div class="flex flex-col gap-4">
                      <div class="flex items-start justify-between gap-3">
                        <div class="min-w-0">
                          <div class="truncate text-16-medium text-text-strong">{prompt().name}</div>
                          <Show when={prompt().description}>
                            <div class="mt-2 text-13-regular text-text-weak">{prompt().description}</div>
                          </Show>
                        </div>
                        <div class="flex shrink-0 items-center gap-2">
                          <Button
                            variant="secondary"
                            onClick={() => void handleCopy()}
                            disabled={!prompt().prompt}
                            title="Copy prompt text"
                          >
                            <Show when={copyOk()} fallback="Copy">
                              Copied
                            </Show>
                          </Button>
                          <Button
                            variant="primary"
                            onClick={() => void handleInsert().catch(() => {})}
                            disabled={!prompt()}
                          >
                            Insert
                          </Button>
                        </div>
                      </div>

                      <Show
                        when={prompt().prompt}
                        fallback={
                          <div class="rounded-md border border-border-weaker-base bg-surface-inset-base px-3 py-2 text-13-regular text-text-weak">
                            This prompt has no body text attached by the server.
                          </div>
                        }
                      >
                        <pre class="max-h-[22rem] overflow-auto whitespace-pre-wrap break-words rounded-md border border-border-weaker-base bg-surface-inset-base p-3 text-12-regular text-text-base">
                          {prompt().prompt}
                        </pre>
                      </Show>
                    </div>
                  )}
                </Show>
              </div>
            </div>
          </div>
        </Dialog>
      </KobalteDialog.Portal>
    </KobalteDialog>
  );
}
