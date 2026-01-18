import { Show } from "solid-js"
import { Dialog, List, Tag, useDialog } from "../ui"
import type { ModelOption } from "../types"

export interface DialogSelectModelProps {
  models: () => ModelOption[]
  current: () => ModelOption | null
  onSelect: (model: ModelOption | null) => void
}

export function DialogSelectModel(props: DialogSelectModelProps) {
  const dialog = useDialog()

  const handleSelect = (model: ModelOption | undefined) => {
    props.onSelect(model ?? null)
    dialog.close()
  }

  return (
    <Dialog title="Select model">
      <List
        search={{ placeholder: "Search models", autofocus: true }}
        emptyMessage="No models found"
        key={(x) => x.id}
        items={props.models}
        current={props.current() ?? undefined}
        filterKeys={["displayName", "model", "description"]}
        sortBy={(a, b) => a.displayName.localeCompare(b.displayName)}
        onSelect={handleSelect}
      >
        {(model) => (
          <div class="w-full flex items-center gap-x-2 text-13-regular">
            <span class="truncate">{model.displayName || model.model}</span>
            <Show when={model.isDefault}>
              <Tag>Default</Tag>
            </Show>
            <Show when={model.supportedReasoningEfforts.length > 0}>
              <Tag>Reasoning</Tag>
            </Show>
          </div>
        )}
      </List>
    </Dialog>
  )
}
