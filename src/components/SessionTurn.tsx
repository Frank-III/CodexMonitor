import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  on,
  onCleanup,
  ParentProps,
  Show,
  Switch,
  type Accessor,
} from "solid-js"
import { createStore } from "solid-js/store"
import { createResizeObserver } from "@solid-primitives/resize-observer"
import type { ConversationItem } from "../types"
import type { WorkspacePathPreviewStore } from "../stores/workspacePathPreview"
import { Markdown } from "./Markdown"
import {
  Accordion,
  BasicTool,
  Button,
  FileIcon,
  Icon,
  IconButton,
  Spinner,
  TodosTool,
  Tooltip,
  Typewriter,
} from "../ui"
import { StickyAccordionHeader } from "../ui/StickyAccordionHeader"

function getDirectory(path: string): string {
  const lastSlash = path.lastIndexOf("/")
  if (lastSlash === -1) return ""
  return path.substring(0, lastSlash + 1)
}

function getFilename(path: string): string {
  const lastSlash = path.lastIndexOf("/")
  if (lastSlash === -1) return path
  return path.substring(lastSlash + 1)
}

function computeStatusFromItem(item: ConversationItem | undefined): string | undefined {
  if (!item) return undefined

  if (item.kind === "tool") {
    switch (item.toolType) {
      case "task":
      case "Task":
        return "Delegating work"
      case "todowrite":
      case "todoread":
        return "Planning next steps"
      case "read":
      case "Read":
        return "Gathering context"
      case "list":
      case "List":
      case "grep":
      case "Grep":
      case "glob":
      case "Glob":
      case "finder":
        return "Searching the codebase"
      case "webfetch":
      case "read_web_page":
      case "web_search":
        return "Searching the web"
      case "edit":
      case "Edit":
      case "write":
      case "Write":
      case "edit_file":
      case "create_file":
      case "fileChange":
        return "Making edits"
      case "bash":
      case "Bash":
        return "Running commands"
      default:
        return undefined
    }
  }
  if (item.kind === "reasoning") {
    const text = item.summary || item.content
    const match = text.trimStart().match(/^\*\*(.+?)\*\*/)
    if (match) return `Thinking · ${match[1].trim()}`
    return "Thinking"
  }
  if (item.kind === "message" && item.role === "assistant") {
    return "Gathering thoughts"
  }
  return undefined
}

export interface SessionTurnProps {
  userMessageId: string
  userMessageText: string
  userMessageTitle?: string
  items: Accessor<ConversationItem[]>
  isWorking: Accessor<boolean>
  stepsExpanded?: boolean
  onStepsExpandedToggle?: () => void
  onOpenFile?: (path: string) => void
  pathPreview?: WorkspacePathPreviewStore
  classes?: {
    root?: string
    content?: string
    container?: string
  }
}

export function SessionTurn(props: ParentProps<SessionTurnProps>) {
  const userItems = createMemo(() => {
    const items = props.items()
    const userIdx = items.findIndex(
      (item) => item.kind === "message" && item.role === "user" && item.id === props.userMessageId
    )
    if (userIdx === -1) return []

    const result: ConversationItem[] = []
    for (let i = userIdx + 1; i < items.length; i++) {
      const item = items[i]
      if (item.kind === "message" && item.role === "user") break
      result.push(item)
    }
    return result
  })

  const assistantTextItems = createMemo(() =>
    userItems().filter((item) => item.kind === "message" && item.role === "assistant")
  )

  const toolItems = createMemo(() =>
    userItems().filter((item) => item.kind === "tool" || item.kind === "reasoning" || item.kind === "diff")
  )

  const lastAssistantText = createMemo(() => {
    const texts = assistantTextItems()
    if (!texts.length) return undefined
    const last = texts[texts.length - 1]
    return last.kind === "message" ? last.text : undefined
  })

  const diffItems = createMemo(() =>
    userItems().filter((item) => item.kind === "diff") as Extract<ConversationItem, { kind: "diff" }>[]
  )

  const fileChangeItems = createMemo(() =>
    userItems().filter(
      (item) => item.kind === "tool" && item.toolType === "fileChange" && item.changes?.length
    ) as Extract<ConversationItem, { kind: "tool" }>[]
  )

  const hasSteps = createMemo(() => toolItems().length > 0)
  const hasDiffs = createMemo(() => diffItems().length > 0 || fileChangeItems().length > 0)

  const rawStatus = createMemo(() => {
    const items = userItems()
    if (!items.length) return undefined
    return computeStatusFromItem(items[items.length - 1])
  })

  const title = createMemo(() => {
    if (props.userMessageTitle) return props.userMessageTitle
    const text = props.userMessageText.trim()
    const firstLine = text.split("\n").map((l) => l.trim()).find(Boolean) ?? ""
    const clean = firstLine.replace(/\s+/g, " ").trim()
    if (clean.length > 80) return clean.slice(0, 80) + "…"
    return clean || "New message"
  })

  const [responseCopied, setResponseCopied] = createSignal(false)
  const handleCopyResponse = async () => {
    const content = lastAssistantText()
    if (!content) return
    await navigator.clipboard.writeText(content)
    setResponseCopied(true)
    setTimeout(() => setResponseCopied(false), 2000)
  }

  const diffInit = 20
  const [store, setStore] = createStore({
    stickyTitleRef: undefined as HTMLDivElement | undefined,
    stickyTriggerRef: undefined as HTMLDivElement | undefined,
    stickyHeaderHeight: 0,
    diffsOpen: [] as string[],
    diffLimit: diffInit,
    status: rawStatus(),
    elapsedMs: 0,
    startedAt: null as number | null,
  })

  createEffect(
    on(
      () => props.userMessageId,
      () => {
        setStore("diffsOpen", [])
        setStore("diffLimit", diffInit)
      },
      { defer: true }
    )
  )

  createResizeObserver(
    () => store.stickyTitleRef,
    ({ height }) => {
      const triggerHeight = store.stickyTriggerRef?.offsetHeight ?? 0
      setStore("stickyHeaderHeight", height + triggerHeight + 8)
    }
  )

  createResizeObserver(
    () => store.stickyTriggerRef,
    ({ height }) => {
      const titleHeight = store.stickyTitleRef?.offsetHeight ?? 0
      setStore("stickyHeaderHeight", titleHeight + height + 8)
    }
  )

  createEffect(() => {
    const isWorking = props.isWorking()
    if (isWorking && !store.startedAt) {
      setStore("startedAt", Date.now())
    }
    if (!isWorking && store.startedAt) {
      setStore("startedAt", null)
    }
  })

  createEffect(() => {
    const startedAt = store.startedAt
    if (!startedAt) {
      setStore("elapsedMs", 0)
      return
    }
    setStore("elapsedMs", Date.now() - startedAt)
    const interval = window.setInterval(() => {
      setStore("elapsedMs", Date.now() - startedAt)
    }, 1000)
    onCleanup(() => window.clearInterval(interval))
  })

  const formattedDuration = createMemo(() => {
    const totalSeconds = Math.max(0, Math.floor(store.elapsedMs / 1000))
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`
    }
    return `${seconds}s`
  })

  let lastStatusChange = Date.now()
  let statusTimeout: number | undefined
  createEffect(() => {
    const newStatus = rawStatus()
    if (newStatus === store.status || !newStatus) return

    const timeSinceLastChange = Date.now() - lastStatusChange
    if (timeSinceLastChange >= 2500) {
      setStore("status", newStatus)
      lastStatusChange = Date.now()
      if (statusTimeout) {
        clearTimeout(statusTimeout)
        statusTimeout = undefined
      }
    } else {
      if (statusTimeout) clearTimeout(statusTimeout)
      statusTimeout = setTimeout(() => {
        setStore("status", rawStatus())
        lastStatusChange = Date.now()
        statusTimeout = undefined
      }, 2500 - timeSinceLastChange) as unknown as number
    }
  })

  return (
    <div data-component="session-turn" class={props.classes?.root}>
      <div data-slot="session-turn-content" class={props.classes?.content}>
        <div
          data-message={props.userMessageId}
          data-slot="session-turn-message-container"
          class={props.classes?.container}
          style={{ "--sticky-header-height": `${store.stickyHeaderHeight}px` }}
        >
          {/* Title (sticky) */}
          <div ref={(el) => setStore("stickyTitleRef", el)} data-slot="session-turn-sticky-title">
            <div data-slot="session-turn-message-header">
              <div data-slot="session-turn-message-title">
                <Switch>
                  <Match when={props.isWorking()}>
                    <Typewriter as="h1" text={title()} data-slot="session-turn-typewriter" />
                  </Match>
                  <Match when={true}>
                    <h1>{title()}</h1>
                  </Match>
                </Switch>
              </div>
            </div>
          </div>

          {/* User Message */}
          <div data-slot="session-turn-message-content">
            <Markdown
              value={props.userMessageText}
              onOpenFile={props.onOpenFile}
              pathPreview={props.pathPreview}
            />
          </div>

          {/* Trigger (sticky) */}
          <Show when={props.isWorking() || hasSteps()}>
            <div ref={(el) => setStore("stickyTriggerRef", el)} data-slot="session-turn-response-trigger">
              <Button
                data-expandable={toolItems().length > 0}
                data-slot="session-turn-collapsible-trigger-content"
                variant="ghost"
                size="small"
                onClick={props.onStepsExpandedToggle ?? (() => {})}
              >
                <Show when={props.isWorking()}>
                  <Spinner />
                </Show>
                <Switch>
                  <Match when={props.isWorking()}>{store.status ?? "Considering next steps"}</Match>
                  <Match when={props.stepsExpanded}>Hide steps</Match>
                  <Match when={!props.stepsExpanded}>Show steps</Match>
                </Switch>
                <span>·</span>
                <span>{formattedDuration()}</span>
                <Show when={toolItems().length > 0}>
                  <Icon name="chevron-grabber-vertical" size="small" />
                </Show>
              </Button>
            </div>
          </Show>

          {/* Steps (expanded) */}
          <Show when={props.stepsExpanded && toolItems().length > 0}>
            <div data-slot="session-turn-collapsible-content-inner">
              <For each={toolItems()}>
                {(item) => (
                  <Switch>
                    <Match when={item.kind === "reasoning" && item}>
                      {(reasoning) => (
                        <BasicTool
                          icon="brain"
                          trigger={{
                            title: "Reasoning",
                            subtitle: reasoning().summary?.slice(0, 60) || undefined,
                          }}
                        >
                          <div data-component="tool-output" data-scrollable>
                            <Markdown
                              value={reasoning().content || reasoning().summary}
                              class="text-xs text-text-weak"
                            />
                          </div>
                        </BasicTool>
                      )}
                    </Match>
                    <Match when={item.kind === "diff" && item}>
                      {(diff) => (
                        <BasicTool
                          icon="code-lines"
                          trigger={{
                            title: diff().title,
                            action: diff().status ? (
                              <span class="text-[10px] uppercase tracking-wider text-text-weak">
                                {diff().status}
                              </span>
                            ) : undefined,
                          }}
                        >
                          <div data-component="tool-output" data-scrollable>
                            <Markdown value={diff().diff} class="text-xs text-text-weak" codeBlock />
                          </div>
                        </BasicTool>
                      )}
                    </Match>
                    <Match when={item.kind === "tool" && item}>
                      {(tool) => (
                        <ToolItemView
                          item={tool()}
                          onOpenFile={props.onOpenFile}
                          pathPreview={props.pathPreview}
                        />
                      )}
                    </Match>
                  </Switch>
                )}
              </For>
            </div>
          </Show>

          {/* Response */}
          <Show when={!props.isWorking() && (lastAssistantText() || hasDiffs())}>
            <div data-slot="session-turn-summary-section">
              <div data-slot="session-turn-summary-copy">
                <Tooltip value={responseCopied() ? "Copied!" : "Copy"} placement="top" gutter={8}>
                  <IconButton
                    icon={responseCopied() ? "check" : "copy"}
                    variant="secondary"
                    onClick={handleCopyResponse}
                  />
                </Tooltip>
              </div>
              <Show when={lastAssistantText()}>
                <div data-slot="session-turn-summary-header">
                  <h2 data-slot="session-turn-summary-title">Response</h2>
                  <Markdown
                    data-slot="session-turn-markdown"
                    data-diffs={hasDiffs()}
                    value={lastAssistantText()!}
                    onOpenFile={props.onOpenFile}
                    pathPreview={props.pathPreview}
                  />
                </div>
              </Show>

              {/* File diffs accordion */}
              <Show when={fileChangeItems().length > 0}>
                <Accordion
                  data-slot="session-turn-accordion"
                  multiple
                  value={store.diffsOpen}
                  onChange={(value) => {
                    if (!Array.isArray(value)) return
                    setStore("diffsOpen", value)
                  }}
                >
                  <For each={fileChangeItems().slice(0, store.diffLimit)}>
                    {(item) => (
                      <For each={item.changes ?? []}>
                        {(change) => (
                          <Accordion.Item value={change.path}>
                            <StickyAccordionHeader>
                              <Accordion.Trigger>
                                <div data-slot="session-turn-accordion-trigger-content">
                                  <div data-slot="session-turn-file-info">
                                    <FileIcon
                                      node={{ path: change.path, type: "file" }}
                                      data-slot="session-turn-file-icon"
                                    />
                                    <div data-slot="session-turn-file-path">
                                      <Show when={change.path.includes("/")}>
                                        <span data-slot="session-turn-directory">
                                          {getDirectory(change.path)}&lrm;
                                        </span>
                                      </Show>
                                      <span data-slot="session-turn-filename">{getFilename(change.path)}</span>
                                    </div>
                                  </div>
                                  <div data-slot="session-turn-accordion-actions">
                                    <Show when={change.kind}>
                                      <span class="text-[10px] uppercase tracking-wider text-text-weak">
                                        {change.kind}
                                      </span>
                                    </Show>
                                    <Icon name="chevron-grabber-vertical" size="small" />
                                  </div>
                                </div>
                              </Accordion.Trigger>
                            </StickyAccordionHeader>
                            <Accordion.Content data-slot="session-turn-accordion-content">
                              <Show when={store.diffsOpen.includes(change.path) && change.diff}>
                                <Markdown value={change.diff!} class="text-xs text-text-weak" codeBlock />
                              </Show>
                            </Accordion.Content>
                          </Accordion.Item>
                        )}
                      </For>
                    )}
                  </For>
                </Accordion>
              </Show>
            </div>
          </Show>
        </div>
        {props.children}
      </div>
    </div>
  )
}

function getToolIcon(toolType: string): "glasses" | "bullet-list" | "magnifying-glass-menu" | "window-cursor" | "task" | "console" | "code-lines" | "brain" | "checklist" | "mcp" {
  switch (toolType) {
    case "read":
    case "Read":
      return "glasses"
    case "list":
    case "List":
      return "bullet-list"
    case "glob":
    case "Glob":
    case "grep":
    case "Grep":
    case "finder":
      return "magnifying-glass-menu"
    case "webfetch":
    case "read_web_page":
    case "web_search":
      return "window-cursor"
    case "task":
    case "Task":
      return "task"
    case "todowrite":
    case "todoread":
      return "checklist"
    case "bash":
    case "Bash":
      return "console"
    case "edit":
    case "Edit":
    case "write":
    case "Write":
    case "edit_file":
    case "create_file":
    case "fileChange":
      return "code-lines"
    case "reasoning":
      return "brain"
    default:
      return "mcp"
  }
}

function ToolItemView(props: {
  item: Extract<ConversationItem, { kind: "tool" }>
  onOpenFile?: (path: string) => void
  pathPreview?: WorkspacePathPreviewStore
}) {
  const icon = () => getToolIcon(props.item.toolType)
  const isFileChange = () => props.item.toolType === "fileChange"
  const isTodo = () => props.item.toolType === "todowrite" || props.item.toolType === "todoread"

  // Handle todo tools separately
  if (isTodo()) {
    const todos = () => props.item.todos ?? []
    return (
      <TodosTool
        todos={todos()}
        defaultOpen
      />
    )
  }

  return (
    <BasicTool
      icon={icon()}
      trigger={{
        title: props.item.title,
        action: props.item.status ? (
          <span class="text-[10px] uppercase tracking-wider text-text-weak">{props.item.status}</span>
        ) : undefined,
      }}
    >
      <div data-component="tool-output" data-scrollable>
        <Show when={!isFileChange() && props.item.detail}>
          <Markdown value={props.item.detail} class="text-xs text-text-weak" />
        </Show>
        <Show when={isFileChange() && props.item.changes?.length}>
          <div class="flex flex-col gap-2">
            <For each={props.item.changes}>
              {(change) => (
                <div class="flex flex-col gap-1">
                  <div class="flex items-center gap-2 text-[11px]">
                    <Show when={change.kind}>
                      <span class="font-medium uppercase tracking-wide text-text-weak">{change.kind}</span>
                    </Show>
                    <Show when={props.onOpenFile} fallback={<span class="text-text-weak">{change.path}</span>}>
                      {(openFile) => (
                        <button
                          type="button"
                          class="text-text-weak transition-colors hover:text-text-base hover:underline"
                          onClick={() => openFile()(change.path)}
                          title="Open in Files panel"
                        >
                          {change.path}
                        </button>
                      )}
                    </Show>
                  </div>
                  <Show when={change.diff}>
                    <Markdown value={change.diff!} class="text-xs text-text-weak" codeBlock />
                  </Show>
                </div>
              )}
            </For>
          </div>
        </Show>
        <Show when={isFileChange() && !props.item.changes?.length && props.item.detail}>
          <Markdown value={props.item.detail} class="text-xs text-text-weak" />
        </Show>
        <Show when={props.item.output && (!isFileChange() || !props.item.changes?.length)}>
          <Markdown value={props.item.output!} class="text-xs text-text-weak" codeBlock />
        </Show>
        <Show when={isFileChange() && props.item.output && props.item.changes?.length}>
          <Markdown value={props.item.output!} class="text-xs text-text-weak" codeBlock />
        </Show>
      </div>
    </BasicTool>
  )
}
