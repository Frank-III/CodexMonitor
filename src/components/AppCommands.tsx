import { useDialog } from "../ui"
import { useCommand, type CommandOption } from "../context/command"
import { CommandPalette } from "./CommandPalette"
import { DialogSelectFile } from "./DialogSelectFile"
import { DialogSelectModel } from "./DialogSelectModel"
import type { ModelOption } from "../types"

export interface AppCommandsProps {
  workspaceId: () => string | null
  models: () => ModelOption[]
  selectedModel: () => ModelOption | null
  onSelectModel: (model: ModelOption | null) => void
  onOpenFile?: (path: string) => void
  onNewSession?: () => void
  onToggleDebug?: () => void
  onOpenSettings?: () => void
  onToggleRightPanel?: () => void
}

export function AppCommands(props: AppCommandsProps) {
  const dialog = useDialog()
  const command = useCommand()

  command.register(() => {
    const options: CommandOption[] = [
      {
        id: "command.palette",
        title: "Command Palette",
        description: "Open the command palette",
        keybind: "mod+shift+p",
        category: "General",
        onSelect: () => {
          dialog.show(() => <CommandPalette />)
        },
      },
      {
        id: "file.open",
        title: "Open File",
        description: "Search and open files",
        keybind: "mod+p",
        category: "Files",
        onSelect: () => {
          dialog.show(() => (
            <DialogSelectFile
              workspaceId={props.workspaceId}
              onOpenFile={props.onOpenFile}
            />
          ))
        },
      },
      {
        id: "model.choose",
        title: "Select Model",
        description: "Choose AI model",
        keybind: "mod+shift+m",
        category: "AI",
        onSelect: () => {
          dialog.show(() => (
            <DialogSelectModel
              models={props.models}
              current={props.selectedModel}
              onSelect={props.onSelectModel}
            />
          ))
        },
      },
    ]

    if (props.onNewSession) {
      options.push({
        id: "session.new",
        title: "New Session",
        description: "Start a new chat session",
        keybind: "mod+n",
        category: "Sessions",
        suggested: true,
        onSelect: props.onNewSession,
      })
    }

    if (props.onToggleDebug) {
      options.push({
        id: "debug.toggle",
        title: "Toggle Debug Panel",
        description: "Show/hide debug information",
        keybind: "mod+shift+d",
        category: "Developer",
        onSelect: props.onToggleDebug,
      })
    }

    if (props.onOpenSettings) {
      options.push({
        id: "settings.open",
        title: "Open Settings",
        description: "Configure application settings",
        keybind: "mod+,",
        category: "General",
        onSelect: props.onOpenSettings,
      })
    }

    if (props.onToggleRightPanel) {
      options.push({
        id: "panel.toggle",
        title: "Toggle Right Panel",
        description: "Show/hide the right panel",
        keybind: "mod+\\",
        category: "Layout",
        onSelect: props.onToggleRightPanel,
      })
    }

    return options
  })

  return null
}
