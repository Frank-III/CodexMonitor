import { Accordion } from "./Accordion"
import { Button } from "./Button"
import { DiffChanges } from "./DiffChanges"
import { FileIcon } from "./FileIcon"
import { Icon } from "./Icon"
import { StickyAccordionHeader } from "./StickyAccordionHeader"
import { For, Match, Show, Switch, type JSX } from "solid-js"
import { createStore } from "solid-js/store"

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

export interface FileDiff {
  file: string
  before?: string
  after?: string
  additions: number
  deletions: number
  diff?: string
}

export interface SessionReviewProps {
  open?: string[]
  onOpenChange?: (open: string[]) => void
  scrollRef?: (el: HTMLDivElement) => void
  onScroll?: JSX.EventHandlerUnion<HTMLDivElement, Event>
  class?: string
  classList?: Record<string, boolean | undefined>
  classes?: { root?: string; header?: string; container?: string }
  actions?: JSX.Element
  diffs: FileDiff[]
  onViewFile?: (file: string) => void
  renderDiff?: (diff: FileDiff) => JSX.Element
}

export function SessionReview(props: SessionReviewProps) {
  const [store, setStore] = createStore({
    open: props.diffs.length > 10 ? [] : props.diffs.map((d) => d.file),
  })

  const open = () => props.open ?? store.open

  const handleChange = (open: string[]) => {
    props.onOpenChange?.(open)
    if (props.open !== undefined) return
    setStore("open", open)
  }

  const handleExpandOrCollapseAll = () => {
    const next = open().length > 0 ? [] : props.diffs.map((d) => d.file)
    handleChange(next)
  }

  return (
    <div
      data-component="session-review"
      ref={props.scrollRef}
      onScroll={props.onScroll}
      classList={{
        ...(props.classList ?? {}),
        [props.classes?.root ?? ""]: !!props.classes?.root,
        [props.class ?? ""]: !!props.class,
      }}
    >
      <div
        data-slot="session-review-header"
        classList={{
          [props.classes?.header ?? ""]: !!props.classes?.header,
        }}
      >
        <div data-slot="session-review-title">Session changes</div>
        <div data-slot="session-review-actions">
          <Button size="normal" icon="chevron-grabber-vertical" onClick={handleExpandOrCollapseAll}>
            <Switch>
              <Match when={open().length > 0}>Collapse all</Match>
              <Match when={true}>Expand all</Match>
            </Switch>
          </Button>
          {props.actions}
        </div>
      </div>
      <div
        data-slot="session-review-container"
        classList={{
          [props.classes?.container ?? ""]: !!props.classes?.container,
        }}
      >
        <Accordion multiple value={open()} onChange={handleChange}>
          <For each={props.diffs}>
            {(diff) => (
              <Accordion.Item value={diff.file} data-slot="session-review-accordion-item">
                <StickyAccordionHeader>
                  <Accordion.Trigger>
                    <div data-slot="session-review-trigger-content">
                      <div data-slot="session-review-file-info">
                        <FileIcon node={{ path: diff.file, type: "file" }} />
                        <div data-slot="session-review-file-name-container">
                          <Show when={diff.file.includes("/")}>
                            <span data-slot="session-review-directory">{getDirectory(diff.file)}&lrm;</span>
                          </Show>
                          <span data-slot="session-review-filename">{getFilename(diff.file)}</span>
                          <Show when={props.onViewFile}>
                            <button
                              data-slot="session-review-view-button"
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                props.onViewFile?.(diff.file)
                              }}
                            >
                              <Icon name="eye" size="small" />
                            </button>
                          </Show>
                        </div>
                      </div>
                      <div data-slot="session-review-trigger-actions">
                        <DiffChanges changes={diff} />
                        <Icon name="chevron-grabber-vertical" size="small" />
                      </div>
                    </div>
                  </Accordion.Trigger>
                </StickyAccordionHeader>
                <Accordion.Content data-slot="session-review-accordion-content">
                  <Show when={open().includes(diff.file)}>
                    <Show
                      when={props.renderDiff}
                      fallback={
                        <Show when={diff.diff}>
                          <pre class="p-3 text-xs font-mono whitespace-pre-wrap overflow-x-auto">
                            {diff.diff}
                          </pre>
                        </Show>
                      }
                    >
                      {(render) => render()(diff)}
                    </Show>
                  </Show>
                </Accordion.Content>
              </Accordion.Item>
            )}
          </For>
        </Accordion>
      </div>
    </div>
  )
}
