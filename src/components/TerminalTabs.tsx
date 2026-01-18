import { createMemo, createSignal, For, Show } from "solid-js";
import { createSortable, DragDropProvider, DragDropSensors, DragOverlay, SortableProvider, closestCenter } from "@thisbeyond/solid-dnd";
import type { DragEvent } from "@thisbeyond/solid-dnd";
import { IconButton, Tabs, Tooltip } from "../ui";
import { ConstrainDragYAxis, getDraggableId } from "../utils/solid-dnd";

export type LocalTerminal = {
  id: string;
  title: string;
  titleNumber: number;
};

export interface TerminalTabsProps {
  terminals: LocalTerminal[];
  activeId: string | undefined;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
  onMove: (id: string, toIndex: number) => void;
  children: (terminal: LocalTerminal) => import("solid-js").JSX.Element;
}

function SortableTerminalTab(props: {
  terminal: LocalTerminal;
  canClose: boolean;
  onClose: () => void;
}) {
  const sortable = createSortable(props.terminal.id);
  return (
    // @ts-ignore solid-dnd directive
    <div use:sortable classList={{ "h-full": true, "opacity-0": sortable.isActiveDraggable }}>
      <div class="relative h-full">
        <Tabs.Trigger
          value={props.terminal.id}
          closeButton={
            props.canClose && (
              <IconButton
                icon="close"
                variant="ghost"
                onClick={(e: MouseEvent) => {
                  e.stopPropagation();
                  props.onClose();
                }}
              />
            )
          }
        >
          {props.terminal.title}
        </Tabs.Trigger>
      </div>
    </div>
  );
}

export function TerminalTabs(props: TerminalTabsProps) {
  const [activeDraggable, setActiveDraggable] = createSignal<string | null>(null);

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
    const fromIndex = props.terminals.findIndex((t) => t.id === draggable.id.toString());
    const toIndex = props.terminals.findIndex((t) => t.id === droppable.id.toString());
    if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
      props.onMove(draggable.id.toString(), toIndex);
    }
  };

  const draggedTerminal = createMemo(() =>
    props.terminals.find((t) => t.id === activeDraggable())
  );

  return (
    <DragDropProvider
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      collisionDetector={closestCenter}
    >
      <DragDropSensors />
      <ConstrainDragYAxis />
      <Tabs variant="alt" value={props.activeId} onChange={props.onSelect}>
        <Tabs.List class="h-10">
          <SortableProvider ids={props.terminals.map((t) => t.id)}>
            <For each={props.terminals}>
              {(terminal) => (
                <SortableTerminalTab
                  terminal={terminal}
                  canClose={props.terminals.length > 1}
                  onClose={() => props.onClose(terminal.id)}
                />
              )}
            </For>
          </SortableProvider>
          <div class="h-full flex items-center justify-center">
            <Tooltip value="New terminal" placement="bottom">
              <IconButton
                icon="plus-small"
                variant="ghost"
                iconSize="large"
                onClick={props.onNew}
              />
            </Tooltip>
          </div>
        </Tabs.List>
        <For each={props.terminals}>
          {(terminal) => (
            <Tabs.Content value={terminal.id}>
              {props.children(terminal)}
            </Tabs.Content>
          )}
        </For>
      </Tabs>
      <DragOverlay>
        <Show when={draggedTerminal()}>
          {(t) => (
            <div class="relative p-1 h-10 flex items-center bg-background-stronger text-14-regular">
              {t().title}
            </div>
          )}
        </Show>
      </DragOverlay>
    </DragDropProvider>
  );
}
