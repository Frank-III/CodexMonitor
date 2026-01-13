import { ComponentProps, For, Match, Show, splitProps, Switch } from "solid-js"
import { Tooltip } from "@kobalte/core/tooltip"
import { DiffChanges } from "./DiffChanges"

export interface MessageNavEntry {
  id: string
  title: string
  diffs?: { additions: number; deletions: number }[]
}

export interface MessageNavProps extends ComponentProps<"ul"> {
  messages: MessageNavEntry[]
  currentId?: string
  size: "normal" | "compact"
  onMessageSelect: (id: string) => void
}

export function MessageNav(props: MessageNavProps) {
  const [local, others] = splitProps(props, ["messages", "currentId", "size", "onMessageSelect"])

  const content = () => (
    <ul role="list" data-component="message-nav" data-size={local.size} {...others}>
      <For each={local.messages}>
        {(message) => {
          const handleClick = () => local.onMessageSelect(message.id)

          return (
            <li data-slot="message-nav-item">
              <Switch>
                <Match when={local.size === "compact"}>
                  <button
                    type="button"
                    data-slot="message-nav-tick-button"
                    data-active={message.id === local.currentId || undefined}
                    onClick={handleClick}
                  >
                    <div data-slot="message-nav-tick-line" />
                  </button>
                </Match>
                <Match when={local.size === "normal"}>
                  <button data-slot="message-nav-message-button" onClick={handleClick}>
                    <Show when={message.diffs?.length}>
                      <DiffChanges changes={message.diffs!} variant="bars" />
                    </Show>
                    <div
                      data-slot="message-nav-title-preview"
                      data-active={message.id === local.currentId || undefined}
                    >
                      <Show when={message.title} fallback="New message">
                        {message.title}
                      </Show>
                    </div>
                  </button>
                </Match>
              </Switch>
            </li>
          )
        }}
      </For>
    </ul>
  )

  return (
    <Switch>
      <Match when={local.size === "compact"}>
        <Tooltip openDelay={0} closeDelay={300} placement="right-start" gutter={-40}>
          <Tooltip.Trigger as="div">{content()}</Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content data-slot="message-nav-tooltip">
              <div data-slot="message-nav-tooltip-content">
                <MessageNav {...props} size="normal" class="" />
              </div>
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip>
      </Match>
      <Match when={local.size === "normal"}>{content()}</Match>
    </Switch>
  )
}
