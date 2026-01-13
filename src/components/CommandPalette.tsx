import { createMemo, createSignal, onCleanup, Show } from "solid-js"
import { Dialog, List, Keybind, useDialog } from "../ui"
import { formatKeybind, useCommand, type CommandOption } from "../context/command"

type Entry = {
  id: string
  title: string
  description?: string
  keybind?: string
  category: string
  option: CommandOption
}

export function CommandPalette() {
  const command = useCommand()
  const dialog = useDialog()
  const state = { cleanup: undefined as (() => void) | void, committed: false }

  const allowed = createMemo(() =>
    command.options.filter(
      (option) => !option.disabled && !option.id.startsWith("suggested.") && option.id !== "command.palette",
    ),
  )

  const commandItem = (option: CommandOption): Entry => ({
    id: option.id,
    title: option.title,
    description: option.description,
    keybind: option.keybind,
    category: option.category ?? "Commands",
    option,
  })

  const items = async (filter: string) => {
    return allowed().map(commandItem)
  }

  const handleMove = (item: Entry | undefined) => {
    state.cleanup?.()
    if (!item) return
    state.cleanup = item.option?.onHighlight?.()
  }

  const handleSelect = (item: Entry | undefined) => {
    if (!item) return
    state.committed = true
    state.cleanup = undefined
    dialog.close()
    item.option?.onSelect?.("palette")
  }

  onCleanup(() => {
    if (state.committed) return
    state.cleanup?.()
  })

  return (
    <Dialog class="pt-3 pb-0 !max-h-[480px]">
      <List
        search={{ placeholder: "Search commands...", autofocus: true, hideIcon: true, class: "pl-3 pr-2 !mb-0" }}
        emptyMessage="No commands found"
        items={items}
        key={(item) => item.id}
        filterKeys={["title", "description", "category"]}
        groupBy={(item) => item.category}
        onMove={handleMove}
        onSelect={handleSelect}
      >
        {(item) => (
          <div class="w-full flex items-center justify-between gap-4 pl-1">
            <div class="flex items-center gap-2 min-w-0">
              <span class="text-14-regular text-text-strong whitespace-nowrap">{item.title}</span>
              <Show when={item.description}>
                <span class="text-14-regular text-text-weak truncate">{item.description}</span>
              </Show>
            </div>
            <Show when={item.keybind}>
              <Keybind class="rounded-[4px]">{formatKeybind(item.keybind ?? "")}</Keybind>
            </Show>
          </div>
        )}
      </List>
    </Dialog>
  )
}
