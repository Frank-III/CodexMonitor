import { createMemo, createSignal, For, Show, onMount, onCleanup } from "solid-js";
import { createSortable, DragDropProvider, DragDropSensors, DragOverlay, SortableProvider, closestCenter } from "@thisbeyond/solid-dnd";
import type { DragEvent } from "@thisbeyond/solid-dnd";
import { FileIcon, IconButton, Tabs, Tooltip } from "../ui";
import { ConstrainDragYAxis, getDraggableId } from "../utils/solid-dnd";
import type { FileTabsStore, FileTab } from "../stores/fileTabs";

export interface FileViewerTabsProps {
  workspaceId: string;
  store: FileTabsStore;
  onOpenFilePicker?: () => void;
}

function getDirectory(path: string): string {
  const lastSlash = path.lastIndexOf("/");
  if (lastSlash === -1) return "";
  return path.substring(0, lastSlash + 1);
}

function SortableFileTab(props: {
  tab: FileTab;
  onClose: () => void;
}) {
  const sortable = createSortable(props.tab.id);
  return (
    // @ts-ignore solid-dnd directive
    <div use:sortable classList={{ "h-full": true, "opacity-0": sortable.isActiveDraggable }}>
      <div class="relative h-full">
        <Tabs.Trigger
          value={props.tab.id}
          closeButton={
            <Tooltip value="Close tab" placement="bottom">
              <IconButton
                icon="close"
                variant="ghost"
                onClick={(e: MouseEvent) => {
                  e.stopPropagation();
                  props.onClose();
                }}
              />
            </Tooltip>
          }
          hideCloseButton
        >
          <div class="flex items-center gap-1.5">
            <FileIcon
              node={{ path: props.tab.path, type: "file" }}
              classList={{
                "grayscale-100 group-data-[selected]/tab:grayscale-0": true,
              }}
            />
            <span class="text-14-medium">{props.tab.name}</span>
          </div>
        </Tabs.Trigger>
      </div>
    </div>
  );
}

function VirtualizedCode(props: { content: string; scrollY?: number; onScroll?: (y: number) => void }) {
  let scroller: HTMLDivElement | undefined;
  const [viewportHeight, setViewportHeight] = createSignal(0);
  const [scrollTop, setScrollTop] = createSignal(props.scrollY ?? 0);

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
    if (!scroller) return;
    setViewportHeight(scroller.clientHeight);
  };

  onMount(() => {
    updateViewport();
    if (!scroller) return;

    if (props.scrollY && props.scrollY > 0) {
      scroller.scrollTop = props.scrollY;
    }

    let raf = 0;
    const handleScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        const top = scroller?.scrollTop ?? 0;
        setScrollTop(top);
        props.onScroll?.(top);
      });
    };

    scroller.addEventListener("scroll", handleScroll, { passive: true });

    const observer = new ResizeObserver(() => {
      updateViewport();
    });
    observer.observe(scroller);

    onCleanup(() => {
      if (raf) window.cancelAnimationFrame(raf);
      scroller?.removeEventListener("scroll", handleScroll);
      observer.disconnect();
    });
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

function FileTabContent(props: {
  tab: FileTab;
  isActive: boolean;
  onScroll?: (y: number) => void;
}) {
  const textContent = createMemo(() => {
    const content = props.tab.content;
    if (!content || content.kind !== "text") return null;
    return content.content;
  });

  const fileMetaLabel = () => {
    const content = props.tab.content;
    if (!content) return null;
    const bytes = new Intl.NumberFormat().format(content.byteLength);
    const suffix = content.truncated ? " (truncated)" : "";
    if (content.kind === "binary") {
      return `${bytes} bytes · binary${suffix}`;
    }
    return `${bytes} bytes${suffix}`;
  };

  return (
    <div class="file-tab-content" data-component="file-tab-content">
      <div class="file-tab-header">
        <div class="file-tab-path" title={props.tab.path}>
          <Show when={props.tab.path.includes("/")}>
            <span class="file-tab-directory">{getDirectory(props.tab.path)}</span>
          </Show>
          <span class="file-tab-filename">{props.tab.name}</span>
        </div>
        <Show when={fileMetaLabel()}>
          {(label) => <div class="file-tab-meta">{label()}</div>}
        </Show>
      </div>

      <Show when={props.tab.error}>
        <div class="file-tab-error">{props.tab.error}</div>
      </Show>

      <Show when={props.tab.isLoading}>
        <div class="file-tab-loading">Loading file…</div>
      </Show>

      <Show when={!props.tab.isLoading && props.tab.content?.kind === "binary"}>
        <div class="file-tab-binary">Binary file preview is not supported.</div>
      </Show>

      <Show when={!props.tab.isLoading && textContent()}>
        {(content) => (
          <VirtualizedCode
            content={content()}
            scrollY={props.tab.scrollY}
            onScroll={props.onScroll}
          />
        )}
      </Show>
    </div>
  );
}

export function FileViewerTabs(props: FileViewerTabsProps) {
  const [activeDraggable, setActiveDraggable] = createSignal<string | null>(null);

  const tabs = createMemo(() => props.store.tabs(props.workspaceId));
  const activeId = createMemo(() => props.store.active(props.workspaceId));

  const handleDragStart = (event: unknown) => {
    const id = getDraggableId(event);
    if (id) setActiveDraggable(id);
  };

  const handleDragEnd = () => {
    setActiveDraggable(null);
  };

  const handleDragOver = (event: DragEvent) => {
    const { draggable, droppable } = event;
    if (!draggable || !droppable) return;
    const allTabs = tabs();
    const fromIndex = allTabs.findIndex((t) => t.id === draggable.id.toString());
    const toIndex = allTabs.findIndex((t) => t.id === droppable.id.toString());
    if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
      props.store.move(props.workspaceId, draggable.id.toString(), toIndex);
    }
  };

  const draggedTab = createMemo(() => tabs().find((t) => t.id === activeDraggable()));

  return (
    <div class="file-viewer-tabs-panel" data-component="file-viewer-tabs-panel">
      <Show
        when={tabs().length > 0}
        fallback={
          <div class="file-viewer-tabs-empty">
            <div class="file-viewer-tabs-empty-text">No files open</div>
            <Show when={props.onOpenFilePicker}>
              <button
                type="button"
                class="file-viewer-tabs-empty-button"
                onClick={props.onOpenFilePicker}
              >
                Open a file
              </button>
            </Show>
          </div>
        }
      >
        <DragDropProvider
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
          collisionDetector={closestCenter}
        >
          <DragDropSensors />
          <ConstrainDragYAxis />
          <Tabs
            variant="alt"
            value={activeId()}
            onChange={(id) => props.store.select(props.workspaceId, id)}
          >
            <Tabs.List class="h-10">
              <SortableProvider ids={tabs().map((t) => t.id)}>
                <For each={tabs()}>
                  {(tab) => (
                    <SortableFileTab
                      tab={tab}
                      onClose={() => props.store.close(props.workspaceId, tab.id)}
                    />
                  )}
                </For>
              </SortableProvider>
              <Show when={props.onOpenFilePicker}>
                <div class="h-full flex items-center justify-center">
                  <Tooltip value="Open file" placement="bottom">
                    <IconButton
                      icon="plus-small"
                      variant="ghost"
                      iconSize="large"
                      onClick={props.onOpenFilePicker}
                    />
                  </Tooltip>
                </div>
              </Show>
            </Tabs.List>
            <For each={tabs()}>
              {(tab) => (
                <Tabs.Content value={tab.id}>
                  <FileTabContent
                    tab={tab}
                    isActive={activeId() === tab.id}
                    onScroll={(y) => props.store.setScrollY(props.workspaceId, tab.id, y)}
                  />
                </Tabs.Content>
              )}
            </For>
          </Tabs>
          <DragOverlay>
            <Show when={draggedTab()}>
              {(t) => (
                <div class="relative px-4 h-10 flex items-center gap-1.5 bg-background-stronger border-x border-border-weak-base">
                  <FileIcon node={{ path: t().path, type: "file" }} />
                  <span class="text-14-medium">{t().name}</span>
                </div>
              )}
            </Show>
          </DragOverlay>
        </DragDropProvider>
      </Show>
    </div>
  );
}
