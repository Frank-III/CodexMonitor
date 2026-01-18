import { ComponentProps, Show, splitProps } from "solid-js"
import { MessageNav, type MessageNavEntry } from "./MessageNav"

export interface SessionMessageRailProps extends ComponentProps<"div"> {
  messages: MessageNavEntry[]
  currentId?: string
  wide?: boolean
  onMessageSelect: (id: string) => void
}

export function SessionMessageRail(props: SessionMessageRailProps) {
  const [local, others] = splitProps(props, ["messages", "currentId", "wide", "onMessageSelect", "class", "classList"])

  return (
    <Show when={(local.messages?.length ?? 0) > 1}>
      <div
        {...others}
        data-component="session-message-rail"
        data-wide={local.wide ? "" : undefined}
        classList={{
          ...(local.classList ?? {}),
          [local.class ?? ""]: !!local.class,
        }}
      >
        <div data-slot="session-message-rail-compact">
          <MessageNav
            messages={local.messages}
            currentId={local.currentId}
            onMessageSelect={local.onMessageSelect}
            size="compact"
          />
        </div>
        <div data-slot="session-message-rail-full">
          <MessageNav
            messages={local.messages}
            currentId={local.currentId}
            onMessageSelect={local.onMessageSelect}
            size={local.wide ? "normal" : "compact"}
          />
        </div>
      </div>
    </Show>
  )
}
