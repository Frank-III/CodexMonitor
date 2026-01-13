import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import type { WorkspaceFileContent } from "../types";

type FileViewerPanelProps = {
  workspaceName: string;
  query: string;
  onQueryChange: (value: string) => void;
  files: { path: string; name: string }[];
  isLoadingFiles: boolean;
  filesError: string | null;
  selectedPath: string | null;
  file: WorkspaceFileContent | null;
  isLoadingFile: boolean;
  fileError: string | null;
  onSelectFile: (path: string) => void;
  onRefreshFiles: () => void;
  onRefreshFile: () => void;
};

export function FileViewerPanel(props: FileViewerPanelProps) {
  const selectedFileLabel = () => props.selectedPath ?? "No file selected";
  const textFile = createMemo(() =>
    props.file && props.file.kind === "text" ? props.file : null,
  );
  const fileMetaLabel = () => {
    const file = props.file;
    if (!file) {
      return null;
    }
    const bytes = new Intl.NumberFormat().format(file.byteLength);
    const suffix = file.truncated ? " (truncated)" : "";
    if (file.kind === "binary") {
      return `${bytes} bytes · binary${suffix}`;
    }
    return `${bytes} bytes${suffix}`;
  };

  return (
    <aside class="file-viewer-panel">
      <div class="file-viewer-header">
        <div class="file-viewer-header-left">
          <span>Files</span>
          <span class="file-viewer-header-meta">{props.workspaceName}</span>
        </div>
        <button
          type="button"
          class="ghost issues-refresh"
          onClick={props.onRefreshFiles}
          disabled={props.isLoadingFiles}
          aria-label="Refresh file list"
          title="Refresh"
        >
          ↻
        </button>
      </div>

      <div class="file-viewer-search">
        <input
          class="file-viewer-search-input"
          type="text"
          value={props.query}
          onInput={(event) => props.onQueryChange(event.currentTarget.value)}
          placeholder="Search files…"
          spellcheck={false}
        />
      </div>

      <Show when={props.filesError}>
        <div class="file-viewer-error">{props.filesError}</div>
      </Show>

      <div class="file-viewer-list">
        <Show
          when={!props.isLoadingFiles && props.files.length > 0}
          fallback={
            <div class="file-viewer-empty">
              {props.isLoadingFiles ? "Searching…" : "No files found."}
            </div>
          }
        >
          <For each={props.files}>
            {(file) => (
              <button
                type="button"
                class="file-viewer-row"
                classList={{ active: props.selectedPath === file.path }}
                onClick={() => props.onSelectFile(file.path)}
                title={file.path}
              >
                <span class="file-viewer-row-name">{file.name}</span>
                <span class="file-viewer-row-path">{file.path}</span>
              </button>
            )}
          </For>
        </Show>
      </div>

      <div class="file-viewer-current">
        <div class="file-viewer-current-header">
          <div class="file-viewer-current-title" title={selectedFileLabel()}>
            {selectedFileLabel()}
          </div>
          <div class="file-viewer-current-actions">
            <Show when={fileMetaLabel()}>
              {(label) => <div class="file-viewer-current-meta">{label()}</div>}
            </Show>
            <button
              type="button"
              class="ghost file-viewer-current-refresh"
              onClick={props.onRefreshFile}
              disabled={!props.selectedPath || props.isLoadingFile}
              aria-label="Reload file"
              title="Reload"
            >
              ↻
            </button>
          </div>
        </div>

        <Show when={props.fileError}>
          <div class="file-viewer-error">{props.fileError}</div>
        </Show>

        <Show when={!props.selectedPath}>
          <div class="file-viewer-empty">Select a file to preview.</div>
        </Show>

        <Show when={props.isLoadingFile}>
          <div class="file-viewer-empty">Loading file…</div>
        </Show>

        <Show when={!props.isLoadingFile && props.file?.kind === "binary"}>
          <div class="file-viewer-empty">Binary file preview is not supported.</div>
        </Show>

        <Show when={!props.isLoadingFile && textFile()}>
          {(file) => <VirtualizedCode content={file().content} />}
        </Show>
      </div>
    </aside>
  );
}

function VirtualizedCode(props: { content: string }) {
  let scroller: HTMLDivElement | undefined;
  const [viewportHeight, setViewportHeight] = createSignal(0);
  const [scrollTop, setScrollTop] = createSignal(0);

  const lineHeight = 18;
  const overscan = 40;

  const lines = createMemo(() => props.content.split("\n"));
  const totalLines = () => lines().length;
  const totalHeight = () => totalLines() * lineHeight;

  const startLine = createMemo(() => {
    const raw = Math.floor(scrollTop() / lineHeight) - overscan;
    return Math.max(0, raw);
  });
  const endLine = createMemo(() => {
    const visible = Math.ceil(viewportHeight() / lineHeight) + overscan * 2;
    return Math.min(totalLines(), startLine() + visible);
  });

  const visibleLines = createMemo(() => lines().slice(startLine(), endLine()));
  const offset = createMemo(() => startLine() * lineHeight);

  const updateViewport = () => {
    if (!scroller) {
      return;
    }
    setViewportHeight(scroller.clientHeight);
  };

  onMount(() => {
    updateViewport();
    if (!scroller) {
      return;
    }

    let raf = 0;
    const handleScroll = () => {
      if (raf) {
        return;
      }
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        setScrollTop(scroller?.scrollTop ?? 0);
      });
    };

    scroller.addEventListener("scroll", handleScroll, { passive: true });

    const observer = new ResizeObserver(() => {
      updateViewport();
    });
    observer.observe(scroller);

    onCleanup(() => {
      if (raf) {
        window.cancelAnimationFrame(raf);
      }
      scroller?.removeEventListener("scroll", handleScroll);
      observer.disconnect();
    });
  });

  createEffect(() => {
    lines();
    if (scroller) {
      scroller.scrollTop = 0;
      setScrollTop(0);
    }
  });

  return (
    <div ref={scroller} class="file-viewer-code" role="region" aria-label="File preview">
      <div class="file-viewer-spacer" style={{ height: `${totalHeight()}px` }}>
        <div class="file-viewer-viewport" style={{ transform: `translateY(${offset()}px)` }}>
          <For each={visibleLines()}>
            {(line, index) => (
              <div class="file-viewer-line">
                <span class="file-viewer-lineno" aria-hidden>
                  {startLine() + index() + 1}
                </span>
                <span class="file-viewer-text">{line.length ? line : " "}</span>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}
