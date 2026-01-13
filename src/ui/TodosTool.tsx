import { createMemo, For, Show } from "solid-js";
import { BasicTool } from "./BasicTool";
import { Checkbox } from "./Checkbox";

export type TodoItem = {
  content: string;
  status: "pending" | "in_progress" | "completed";
};

export interface TodosToolProps {
  todos: TodoItem[];
  defaultOpen?: boolean;
  hideDetails?: boolean;
}

export function TodosTool(props: TodosToolProps) {
  const subtitle = createMemo(() => {
    const list = props.todos;
    if (list.length === 0) return "";
    return `${list.filter((t) => t.status === "completed").length}/${list.length}`;
  });

  return (
    <BasicTool
      defaultOpen={props.defaultOpen ?? true}
      hideDetails={props.hideDetails}
      icon="checklist"
      trigger={{
        title: "To-dos",
        subtitle: subtitle(),
      }}
    >
      <Show when={props.todos.length}>
        <div data-component="todos">
          <For each={props.todos}>
            {(todo) => (
              <Checkbox readOnly checked={todo.status === "completed"}>
                <div
                  data-slot="message-part-todo-content"
                  data-completed={todo.status === "completed"}
                >
                  {todo.content}
                </div>
              </Checkbox>
            )}
          </For>
        </div>
      </Show>
    </BasicTool>
  );
}
