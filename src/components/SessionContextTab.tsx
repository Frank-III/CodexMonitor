import { createMemo, For, Show, type JSX } from "solid-js"
import { Icon, Accordion, StickyAccordionHeader } from "../ui"

export interface SessionMessage {
  id: string
  role: "user" | "assistant"
  text: string
  tokens?: {
    input?: number
    output?: number
    reasoning?: number
  }
  createdAt?: number
}

export interface SessionContextTabProps {
  sessionId: () => string | null
  sessionTitle: () => string | null
  messages: () => SessionMessage[]
  usage?: () => {
    inputTokens: number
    outputTokens: number
    reasoningTokens: number
    cacheReadTokens?: number
    cacheWriteTokens?: number
  } | null
}

export function SessionContextTab(props: SessionContextTabProps) {
  const counts = createMemo(() => {
    const all = props.messages()
    const user = all.filter((x) => x.role === "user").length
    const assistant = all.filter((x) => x.role === "assistant").length
    return { all: all.length, user, assistant }
  })

  const ctx = createMemo(() => {
    const usage = props.usage?.()
    if (!usage) return null

    const input = usage.inputTokens
    const output = usage.outputTokens
    const reasoning = usage.reasoningTokens ?? 0
    const cacheRead = usage.cacheReadTokens ?? 0
    const cacheWrite = usage.cacheWriteTokens ?? 0
    const total = input + output + reasoning + cacheRead + cacheWrite

    return { input, output, reasoning, cacheRead, cacheWrite, total }
  })

  const breakdown = createMemo(() => {
    const c = ctx()
    if (!c || c.input === 0) return []

    const input = c.input
    const output = c.output
    const reasoning = c.reasoning
    const total = input + output + reasoning

    if (total === 0) return []

    const pct = (tokens: number) => (tokens / total) * 100
    const pctLabel = (tokens: number) => (Math.round(pct(tokens) * 10) / 10).toString() + "%"

    return [
      {
        key: "input",
        label: "Input",
        tokens: input,
        width: pct(input),
        percent: pctLabel(input),
        color: "var(--syntax-success)",
      },
      {
        key: "output",
        label: "Output",
        tokens: output,
        width: pct(output),
        percent: pctLabel(output),
        color: "var(--syntax-info)",
      },
      {
        key: "reasoning",
        label: "Reasoning",
        tokens: reasoning,
        width: pct(reasoning),
        percent: pctLabel(reasoning),
        color: "var(--syntax-warning)",
      },
    ].filter((x) => x.tokens > 0)
  })

  const number = (value: number | null | undefined) => {
    if (value === undefined || value === null) return "—"
    return value.toLocaleString()
  }

  const time = (value: number | undefined) => {
    if (!value) return "—"
    return new Date(value).toLocaleString()
  }

  const stats = createMemo(() => {
    const c = ctx()
    const count = counts()
    const messages = props.messages()
    const lastMessage = messages[messages.length - 1]

    return [
      { label: "Session", value: props.sessionTitle() ?? props.sessionId() ?? "—" },
      { label: "Messages", value: count.all.toLocaleString() },
      { label: "User Messages", value: count.user.toLocaleString() },
      { label: "Assistant Messages", value: count.assistant.toLocaleString() },
      { label: "Total Tokens", value: number(c?.total) },
      { label: "Input Tokens", value: number(c?.input) },
      { label: "Output Tokens", value: number(c?.output) },
      { label: "Reasoning Tokens", value: number(c?.reasoning) },
      { label: "Cache (read/write)", value: `${number(c?.cacheRead)} / ${number(c?.cacheWrite)}` },
      { label: "Last Activity", value: time(lastMessage?.createdAt) },
    ]
  })

  function Stat(statProps: { label: string; value: JSX.Element }) {
    return (
      <div class="session-context-stat">
        <div class="session-context-stat-label">{statProps.label}</div>
        <div class="session-context-stat-value">{statProps.value}</div>
      </div>
    )
  }

  function RawMessage(msgProps: { message: SessionMessage }) {
    return (
      <Accordion.Item value={msgProps.message.id}>
        <StickyAccordionHeader>
          <Accordion.Trigger>
            <div class="session-context-raw-trigger">
              <div class="session-context-raw-label">
                {msgProps.message.role}{" "}
                <span class="session-context-raw-id">• {msgProps.message.id.slice(0, 8)}</span>
              </div>
              <div class="session-context-raw-meta">
                <Show when={msgProps.message.createdAt}>
                  <div class="session-context-raw-time">
                    {time(msgProps.message.createdAt)}
                  </div>
                </Show>
                <Icon name="chevron-grabber-vertical" size="small" class="session-context-raw-icon" />
              </div>
            </div>
          </Accordion.Trigger>
        </StickyAccordionHeader>
        <Accordion.Content class="session-context-raw-content">
          <div class="session-context-raw-body">
            <pre class="session-context-raw-json">
              {JSON.stringify(msgProps.message, null, 2)}
            </pre>
          </div>
        </Accordion.Content>
      </Accordion.Item>
    )
  }

  return (
    <div class="session-context-tab" data-component="session-context-tab">
      <div class="session-context-inner">
        <div class="session-context-stats-grid">
          <For each={stats()}>{(stat) => <Stat label={stat.label} value={stat.value} />}</For>
        </div>

        <Show when={breakdown().length > 0}>
          <div class="session-context-breakdown">
            <div class="session-context-breakdown-label">Token Breakdown</div>
            <div class="session-context-breakdown-bar">
              <For each={breakdown()}>
                {(segment) => (
                  <div
                    class="session-context-breakdown-segment"
                    style={{
                      width: `${segment.width}%`,
                      "background-color": segment.color,
                    }}
                  />
                )}
              </For>
            </div>
            <div class="session-context-breakdown-legend">
              <For each={breakdown()}>
                {(segment) => (
                  <div class="session-context-breakdown-item">
                    <div class="session-context-breakdown-dot" style={{ "background-color": segment.color }} />
                    <div>{segment.label}</div>
                    <div class="session-context-breakdown-pct">{segment.percent}</div>
                  </div>
                )}
              </For>
            </div>
          </div>
        </Show>

        <div class="session-context-raw-section">
          <div class="session-context-raw-heading">Raw messages</div>
          <Accordion multiple>
            <For each={props.messages()}>{(message) => <RawMessage message={message} />}</For>
          </Accordion>
        </div>
      </div>
    </div>
  )
}
