import { createEffect, createMemo, createSignal, Show, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import type { WorkspaceDirTreeEntry, WorkspaceFileContent } from "../types";
import type { WorkspacePathPreviewStore } from "../stores/workspacePathPreview";

type MentionKind = "file" | "dir";

type FileMentionProps = {
  kind: MentionKind;
  path: string; // workspace-relative, no leading slash
  preview: WorkspacePathPreviewStore;
  onOpenFile?: (path: string) => void;
};

type PopoverPosition = {
  top: number;
  left: number;
  placement: "top" | "bottom";
};

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
      <div
        class="file-mention-tree-row"
        style={{ "padding-left": `${depth * 14}px` }}
      >
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

function previewSnippet(file: WorkspaceFileContent, maxLines: number) {
  if (file.kind !== "text") {
    return null;
  }
  const lines = file.content.split("\n");
  const sliced = lines.slice(0, maxLines);
  const suffix =
    lines.length > maxLines || file.truncated ? "\n… (truncated)" : "";
  return `${sliced.join("\n")}${suffix}`;
}

export function FileMention(props: FileMentionProps) {
  const [triggerHover, setTriggerHover] = createSignal(false);
  const [popoverHover, setPopoverHover] = createSignal(false);
  const [focused, setFocused] = createSignal(false);
  const isOpen = createMemo(
    () => triggerHover() || popoverHover() || focused(),
  );

  const [position, setPosition] = createSignal<PopoverPosition | null>(null);
  let triggerRef: HTMLButtonElement | undefined;
  let popoverRef: HTMLDivElement | undefined;

  const label = createMemo(() => `@${props.path}${props.kind === "dir" ? "/" : ""}`);
  const title = createMemo(() =>
    props.kind === "dir" ? `Folder: ${props.path}` : `File: ${props.path}`,
  );

  const dirPreview = createMemo(() => {
    const state = props.preview.state();
    return state.dirs[props.path] ?? { status: "idle", data: null, error: null };
  });

  const filePreview = createMemo(() => {
    const state = props.preview.state();
    return state.files[props.path] ?? { status: "idle", data: null, error: null };
  });

  const snippet = createMemo(() => {
    const file = filePreview().data;
    if (!file || file.kind !== "text") {
      return "";
    }
    return previewSnippet(file, 18) ?? "";
  });

  const dirRows = createMemo(() => {
    const dir = dirPreview().data;
    if (!dir) {
      return null;
    }
    return renderTreeRows(dir.entries, 0);
  });

  const updatePosition = () => {
    const trigger = triggerRef;
    const popover = popoverRef;
    if (!trigger || !popover) {
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const margin = 10;
    const width = popover.offsetWidth || 360;
    const height = popover.offsetHeight || 240;

    const roomBelow = window.innerHeight - rect.bottom - margin;
    const roomAbove = rect.top - margin;
    const placement: "top" | "bottom" =
      roomBelow >= height || roomBelow >= roomAbove ? "bottom" : "top";

    let left = rect.left;
    left = Math.max(margin, Math.min(left, window.innerWidth - margin - width));

    const top =
      placement === "bottom" ? rect.bottom + margin : rect.top - margin;

    setPosition({ top, left, placement });
  };

  createEffect(() => {
    if (!isOpen()) {
      setPosition(null);
      return;
    }

    if (props.kind === "dir") {
      props.preview.ensureDir(props.path);
    } else {
      props.preview.ensureFile(props.path);
    }

    requestAnimationFrame(updatePosition);
    const handle = () => updatePosition();
    window.addEventListener("resize", handle);
    window.addEventListener("scroll", handle, true);
    return () => {
      window.removeEventListener("resize", handle);
      window.removeEventListener("scroll", handle, true);
    };
  });

  createEffect(() => {
    if (!isOpen()) return;
    if (props.kind === "dir") {
      dirPreview();
    } else {
      filePreview();
    }
    requestAnimationFrame(updatePosition);
  });

  const handleClick = () => {
    if (props.kind !== "file") {
      return;
    }
    props.onOpenFile?.(props.path);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        class="file-mention"
        title={title()}
        onClick={handleClick}
        onPointerEnter={() => setTriggerHover(true)}
        onPointerLeave={() => setTriggerHover(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      >
        <span class="file-mention-icon" aria-hidden>
          <Show when={props.kind === "dir"} fallback={<FileIcon />}>
            <FolderIcon />
          </Show>
        </span>
        <span class="file-mention-label">{label()}</span>
      </button>

      <Show when={isOpen() && position()}>
        {(pos) => (
          <Portal>
            <div
              ref={popoverRef}
              class="file-mention-popover"
              role="tooltip"
              style={{
                top: `${pos().top}px`,
                left: `${pos().left}px`,
                transform: pos().placement === "top" ? "translateY(-100%)" : undefined,
              }}
              onPointerEnter={() => setPopoverHover(true)}
              onPointerLeave={() => setPopoverHover(false)}
            >
              <div class="file-mention-popover-header">
                <span class="file-mention-popover-title">{title()}</span>
                <Show when={props.kind === "file" && props.onOpenFile}>
                  <button
                    type="button"
                    class="file-mention-popover-action"
                    onClick={handleClick}
                  >
                    Open
                  </button>
                </Show>
              </div>

              <Show
                when={
                  (props.kind === "dir" ? dirPreview().status : filePreview().status) !==
                  "loading"
                }
                fallback={
                  <div class="file-mention-popover-loading">Loading…</div>
                }
              >
                <Show
                  when={
                    (props.kind === "dir"
                      ? dirPreview().status
                      : filePreview().status) !== "error"
                  }
                  fallback={
                    <div class="file-mention-popover-error">
                      {props.kind === "dir"
                        ? dirPreview().error
                        : filePreview().error}
                    </div>
                  }
                >
                  <Show
                    when={props.kind === "dir"}
                    fallback={
                      <div class="file-mention-popover-body">
                        <Show
                          when={filePreview().data?.kind === "text"}
                          fallback={
                            <div class="file-mention-popover-muted">
                              Binary file ({filePreview().data?.byteLength ?? 0}{" "}
                              bytes)
                            </div>
                          }
                        >
	                          <pre class="file-mention-popover-code">
	                            {snippet()}
	                          </pre>
	                        </Show>
	                      </div>
                    }
                  >
                    <div class="file-mention-popover-body">
                      <Show
                        when={dirPreview().data?.entries?.length}
                        fallback={
                          <div class="file-mention-popover-muted">
                            Folder is empty.
                          </div>
                        }
	                      >
	                        <div class="file-mention-tree">
	                          {dirRows()}
	                        </div>
                        <Show when={dirPreview().data?.truncated}>
                          <div class="file-mention-popover-muted">
                            … truncated
                          </div>
                        </Show>
                      </Show>
                    </div>
                  </Show>
                </Show>
              </Show>
            </div>
          </Portal>
        )}
      </Show>
    </>
  );
}
