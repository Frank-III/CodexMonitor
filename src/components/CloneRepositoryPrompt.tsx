import { Dialog as KobalteDialog } from "@kobalte/core/dialog";
import { Show, createMemo } from "solid-js";
import { createStore } from "solid-js/store";
import { Button, Dialog, TextField } from "../ui";

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
        <Dialog title="Clone repository">
          <div class="flex flex-col gap-4 px-6 pb-6">
            <div class="rounded-md bg-surface-base px-3 py-2 text-13-regular text-text-weak">
              Uses <code class="font-mono text-text-base">jj git clone</code> and then adds the new
              directory as a workspace.
            </div>

            <TextField
              label="Repository URL"
              value={state.url}
              onChange={(value) => setState("url", value)}
              placeholder="https://github.com/org/repo.git"
              spellcheck={false}
              class="font-mono"
              autofocus
            />

            <div class="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <TextField
                label="Folder name"
                value={effectiveFolderName()}
                onChange={(value) => {
                  setState("folderNameDirty", true);
                  setState("folderName", value);
                }}
                placeholder="repo-name"
                spellcheck={false}
                class="font-mono"
              />
              <Button variant="secondary" size="large" onClick={handlePickParentDirectory} disabled={state.isCloning}>
                Choose folder…
              </Button>
            </div>

            <div class="rounded-md bg-surface-base px-3 py-2 text-13-regular text-text-weak">
              <div class="text-12-medium uppercase tracking-wide text-text-weak">Destination</div>
              <code class="mt-1 block break-words font-mono text-text-base">
                {destinationPath() || "(choose a folder)"}
              </code>
            </div>

            <Show when={state.error}>
              {(error) => (
                <div class="rounded-md bg-surface-critical-weak px-3 py-2 text-13-regular text-text-on-critical-weak">
                  {error()}
                </div>
              )}
            </Show>

            <div class="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={props.onClose} disabled={state.isCloning}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleClone} disabled={!canClone()}>
                {state.isCloning ? "Cloning…" : "Clone"}
              </Button>
            </div>
          </div>
        </Dialog>
      </KobalteDialog.Portal>
    </KobalteDialog>
  );
}
