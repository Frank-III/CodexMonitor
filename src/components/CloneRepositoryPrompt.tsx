import { Show, createMemo } from "solid-js";
import { createStore } from "solid-js/store";

type CloneRepositoryPromptProps = {
  open: boolean;
  onClose: () => void;
  onPickParentDirectory: () => Promise<string | null>;
  onClone: (options: { url: string; destinationPath: string }) => Promise<void>;
};

function deriveRepoName(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";

  const normalized = trimmed.replace(/:/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  const last = parts.length ? parts[parts.length - 1] : "";
  const withoutGit = last.replace(/\.git$/i, "");
  return withoutGit;
}

function sanitizeFolderName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  let out = "";
  let lastWasDash = false;
  for (const ch of trimmed) {
    if (/[a-z0-9]/i.test(ch)) {
      out += ch.toLowerCase();
      lastWasDash = false;
      continue;
    }
    if (ch === "." || ch === "_" || ch === "-") {
      if (!out && ch === "-") continue;
      out += ch;
      lastWasDash = ch === "-";
      continue;
    }
    if (ch === " " || ch === "/") {
      if (out && !lastWasDash) {
        out += "-";
        lastWasDash = true;
      }
    }
  }
  return out.replace(/-+$/g, "");
}

function joinPath(parentDir: string, name: string): string {
  if (!parentDir) return name;
  if (!name) return parentDir;
  if (parentDir.endsWith("/")) return `${parentDir}${name}`;
  return `${parentDir}/${name}`;
}

export function CloneRepositoryPrompt(props: CloneRepositoryPromptProps) {
  return (
    <Show when={props.open}>
      <CloneRepositoryPromptContent {...props} />
    </Show>
  );
}

function CloneRepositoryPromptContent(props: CloneRepositoryPromptProps) {
  const [state, setState] = createStore<{
    url: string;
    parentDir: string | null;
    folderName: string;
    folderNameDirty: boolean;
    isCloning: boolean;
    error: string | null;
  }>({
    url: "",
    parentDir: null,
    folderName: "",
    folderNameDirty: false,
    isCloning: false,
    error: null,
  });

  const suggestedFolderName = createMemo(() =>
    sanitizeFolderName(deriveRepoName(state.url)),
  );

  const effectiveFolderName = createMemo(() =>
    state.folderNameDirty ? state.folderName : suggestedFolderName(),
  );

  const destinationPath = createMemo(() => {
    const parent = state.parentDir;
    const name = effectiveFolderName().trim();
    if (!parent || !name) return "";
    return joinPath(parent, name);
  });

  const handlePickParentDirectory = async () => {
    setState("error", null);
    try {
      const selection = await props.onPickParentDirectory();
      if (selection) {
        setState("parentDir", selection);
      }
    } catch (err) {
      setState("error", err instanceof Error ? err.message : String(err));
    }
  };

  const handleClone = async () => {
    if (state.isCloning) {
      return;
    }
    const trimmedUrl = state.url.trim();
    const parent = state.parentDir;
    const name = effectiveFolderName().trim();
    if (!trimmedUrl) {
      setState("error", "Repository URL is required.");
      return;
    }
    if (!parent) {
      setState("error", "Choose a destination folder.");
      return;
    }
    if (!name) {
      setState("error", "Folder name is required.");
      return;
    }
    if (name.includes("/") || name.includes("\\")) {
      setState("error", "Folder name must not contain path separators.");
      return;
    }

    const dest = destinationPath();
    if (!dest) {
      setState("error", "Destination path is invalid.");
      return;
    }

    setState({ isCloning: true, error: null });
    try {
      await props.onClone({ url: trimmedUrl, destinationPath: dest });
      props.onClose();
    } catch (err) {
      setState({
        error: err instanceof Error ? err.message : String(err),
        isCloning: false,
      });
    }
  };

  const canClone = () => {
    return (
      !!state.url.trim() &&
      !!state.parentDir &&
      !!effectiveFolderName().trim() &&
      !state.isCloning
    );
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
    >
      <div
        class="w-[calc(100vw-40px)] max-w-[620px] max-h-[calc(100vh-80px)] overflow-auto rounded-[14px] border border-white/10 bg-[rgba(18,22,32,0.98)] p-[14px] shadow-[0_18px_36px_rgba(0,0,0,0.35)]"
        role="dialog"
        aria-modal="true"
      >
          <div class="mb-[10px] flex items-center justify-between gap-3">
            <div class="text-[12px] font-bold uppercase tracking-[0.1em] text-white/70">
              Clone Repository
            </div>
            <button
              type="button"
              class="ghost icon-button"
              onClick={props.onClose}
              aria-label="Close clone prompt"
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

          <div class="px-[2px] pb-[10px] pt-[6px] text-[12px] leading-relaxed text-white/70">
            <div class="rounded-[12px] border border-white/10 bg-white/5 p-[10px] text-[11px] text-white/60">
              Uses <code class="text-white/80">jj git clone</code> and then adds the new directory
              as a workspace.
            </div>

            <div class="mt-[12px] flex flex-col gap-[12px]">
              <div class="flex flex-col gap-[6px]">
                <label class="text-[11px] text-white/70" for="clone-repo-url">
                  Repository URL
                </label>
                <input
                  id="clone-repo-url"
                  class="rounded-[10px] border border-white/15 bg-white/5 px-[10px] py-[8px] font-mono text-[12px] text-white/90 outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-400/20"
                  type="text"
                  value={state.url}
                  placeholder="https://github.com/org/repo.git"
                  onInput={(event) => setState("url", event.currentTarget.value)}
                  spellcheck={false}
                />
              </div>

              <div class="grid grid-cols-1 gap-[10px] sm:grid-cols-[1fr_auto] sm:items-end">
                <div class="flex flex-col gap-[6px]">
                  <label class="text-[11px] text-white/70" for="clone-folder-name">
                    Folder name
                  </label>
	                <input
	                  id="clone-folder-name"
	                  class="rounded-[10px] border border-white/15 bg-white/5 px-[10px] py-[8px] font-mono text-[12px] text-white/90 outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-400/20"
	                  type="text"
	                  value={effectiveFolderName()}
	                  placeholder="repo-name"
	                  onInput={(event) => {
	                    setState("folderNameDirty", true);
	                    setState("folderName", event.currentTarget.value);
	                  }}
	                  spellcheck={false}
	                />
                </div>

                <button
                  type="button"
                  class="secondary"
                  onClick={handlePickParentDirectory}
                  disabled={state.isCloning}
                >
                  Choose folder…
                </button>
              </div>

              <div class="rounded-[12px] border border-white/10 bg-white/5 p-[10px] text-[11px] text-white/60">
                <div class="mb-[4px] text-[10px] uppercase tracking-[0.1em] text-white/45">
                  Destination
                </div>
                <code class="text-white/80">
                  {destinationPath() || "(choose a folder)"}
                </code>
              </div>
            </div>

            <Show when={state.error}>
              <div class="mt-[12px] whitespace-pre-wrap break-words rounded-[10px] border border-red-300/20 bg-red-300/10 p-[10px] text-[12px] text-red-200">
                {state.error}
              </div>
            </Show>
          </div>

          <div class="flex justify-end gap-[10px] border-t border-white/10 pt-[8px]">
            <button
              type="button"
              class="secondary"
              onClick={props.onClose}
              disabled={state.isCloning}
            >
              Cancel
            </button>
            <button
              type="button"
              class="primary"
              onClick={handleClone}
              disabled={!canClone()}
            >
              {state.isCloning ? "Cloning…" : "Clone"}
            </button>
          </div>
        </div>
      </div>
  );
}
