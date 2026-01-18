import { Show, type Accessor, type JSX } from "solid-js";
import { createStore } from "solid-js/store";
import { InlineInput } from "../ui";

type EditorStore = {
  active: string;
  value: string;
};

const [editor, setEditor] = createStore<EditorStore>({
  active: "",
  value: "",
});

let editorRef: HTMLInputElement | undefined;

export { setEditor };

export function editorOpen(id: string) {
  return editor.active === id;
}

export function editorValue() {
  return editor.value;
}

export function openEditor(id: string, value: string) {
  if (!id) return;
  setEditor({ active: id, value });
  queueMicrotask(() => editorRef?.focus());
}

export function closeEditor() {
  setEditor({ active: "", value: "" });
}

export function saveEditor(callback: (next: string) => void) {
  const next = editor.value.trim();
  if (!next) {
    closeEditor();
    return;
  }
  closeEditor();
  callback(next);
}

export function editorKeyDown(event: KeyboardEvent, callback: (next: string) => void) {
  if (event.key === "Enter") {
    event.preventDefault();
    saveEditor(callback);
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    closeEditor();
  }
}

export type InlineEditorProps = {
  id: string;
  value: Accessor<string>;
  onSave: (next: string) => void;
  class?: string;
  displayClass?: string;
  editing?: boolean;
  stopPropagation?: boolean;
  openOnDblClick?: boolean;
};

export function InlineEditor(props: InlineEditorProps): JSX.Element {
  const isEditing = () => props.editing ?? editorOpen(props.id);
  const stopEvents = () => props.stopPropagation ?? false;
  const allowDblClick = () => props.openOnDblClick ?? true;

  const stopPropagation = (event: Event) => {
    if (!stopEvents()) return;
    event.stopPropagation();
  };

  const handleDblClick = (event: MouseEvent) => {
    if (!allowDblClick()) return;
    stopPropagation(event);
    openEditor(props.id, props.value());
  };

  return (
    <Show
      when={isEditing()}
      fallback={
        <span
          class={props.displayClass ?? props.class}
          onDblClick={handleDblClick}
          onPointerDown={stopPropagation}
          onMouseDown={stopPropagation}
          onClick={stopPropagation}
          onTouchStart={stopPropagation}
        >
          {props.value()}
        </span>
      }
    >
      <InlineInput
        ref={(el) => {
          editorRef = el;
        }}
        value={editorValue()}
        class={props.class}
        onInput={(event) => setEditor("value", event.currentTarget.value)}
        onKeyDown={(event) => editorKeyDown(event, props.onSave)}
        onBlur={() => closeEditor()}
        onPointerDown={stopPropagation}
        onClick={stopPropagation}
        onDblClick={stopPropagation}
        onMouseDown={stopPropagation}
        onMouseUp={stopPropagation}
        onTouchStart={stopPropagation}
      />
    </Show>
  );
}
