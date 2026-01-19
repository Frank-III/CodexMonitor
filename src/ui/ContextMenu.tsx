import { ContextMenu as Kobalte } from "@kobalte/core/context-menu";
import { splitProps, type ComponentProps, type ParentProps } from "solid-js";

export interface ContextMenuProps extends ComponentProps<typeof Kobalte> {}
export interface ContextMenuTriggerProps extends ComponentProps<typeof Kobalte.Trigger> {}
export interface ContextMenuContentProps extends ComponentProps<typeof Kobalte.Content> {}
export interface ContextMenuItemProps extends ComponentProps<typeof Kobalte.Item> {}
export interface ContextMenuSeparatorProps extends ComponentProps<typeof Kobalte.Separator> {}
export interface ContextMenuGroupLabelProps extends ComponentProps<typeof Kobalte.GroupLabel> {}

function ContextMenuRoot(props: ContextMenuProps) {
  return <Kobalte {...props} data-component="context-menu" />;
}

function ContextMenuTrigger(props: ParentProps<ContextMenuTriggerProps>) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  return (
    <Kobalte.Trigger
      {...rest}
      data-slot="context-menu-trigger"
      classList={{
        ...(local.classList ?? {}),
        [local.class ?? ""]: !!local.class,
      }}
    >
      {local.children}
    </Kobalte.Trigger>
  );
}

function ContextMenuPortal(props: ComponentProps<typeof Kobalte.Portal>) {
  return <Kobalte.Portal {...props} />;
}

function ContextMenuContent(props: ParentProps<ContextMenuContentProps>) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  return (
    <Kobalte.Content
      {...rest}
      data-component="context-menu-content"
      classList={{
        ...(local.classList ?? {}),
        [local.class ?? ""]: !!local.class,
      }}
    >
      {local.children}
    </Kobalte.Content>
  );
}

function ContextMenuItem(props: ParentProps<ContextMenuItemProps>) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  return (
    <Kobalte.Item
      {...rest}
      data-slot="context-menu-item"
      classList={{
        ...(local.classList ?? {}),
        [local.class ?? ""]: !!local.class,
      }}
    >
      {local.children}
    </Kobalte.Item>
  );
}

function ContextMenuSeparator(props: ContextMenuSeparatorProps) {
  const [local, rest] = splitProps(props, ["class", "classList"]);
  return (
    <Kobalte.Separator
      {...rest}
      data-slot="context-menu-separator"
      classList={{
        ...(local.classList ?? {}),
        [local.class ?? ""]: !!local.class,
      }}
    />
  );
}

function ContextMenuGroupLabel(props: ParentProps<ContextMenuGroupLabelProps>) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  return (
    <Kobalte.GroupLabel
      {...rest}
      data-slot="context-menu-group-label"
      classList={{
        ...(local.classList ?? {}),
        [local.class ?? ""]: !!local.class,
      }}
    >
      {local.children}
    </Kobalte.GroupLabel>
  );
}

function ContextMenuItemLabel(props: ParentProps<ComponentProps<"span">>) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  return (
    <span
      {...rest}
      data-slot="context-menu-item-label"
      classList={{
        ...(local.classList ?? {}),
        [local.class ?? ""]: !!local.class,
      }}
    >
      {local.children}
    </span>
  );
}

export const ContextMenu = Object.assign(ContextMenuRoot, {
  Trigger: ContextMenuTrigger,
  Portal: ContextMenuPortal,
  Content: ContextMenuContent,
  Item: ContextMenuItem,
  ItemLabel: ContextMenuItemLabel,
  Separator: ContextMenuSeparator,
  GroupLabel: ContextMenuGroupLabel,
});

