import { Show, createMemo } from "solid-js";
import { Icon, Keybind } from "../ui";
import { useCommand } from "../context";

export interface TitlebarSearchButtonProps {
  workspaceName: string;
}

export function TitlebarSearchButton(props: TitlebarSearchButtonProps) {
  const command = useCommand();
  const keybind = createMemo(() => command.keybind("file.open"));

  return (
    <button
      type="button"
      class="titlebar-search-button"
      onClick={() => command.trigger("file.open")}
    >
      <div class="titlebar-search-leading">
        <Icon name="magnifying-glass" size="small" class="titlebar-search-icon" />
        <span class="titlebar-search-placeholder">Search {props.workspaceName}</span>
      </div>
      <Show when={keybind()}>
        {(kb) => <Keybind class="shrink-0">{kb()}</Keybind>}
      </Show>
    </button>
  );
}

