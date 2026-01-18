import { DropdownMenu as Kobalte } from "@kobalte/core/dropdown-menu";
import { splitProps, type ComponentProps, type ParentProps } from "solid-js";

export interface DropdownMenuProps extends ComponentProps<typeof Kobalte> {}
export interface DropdownMenuTriggerProps extends ComponentProps<typeof Kobalte.Trigger> {}
export interface DropdownMenuContentProps extends ComponentProps<typeof Kobalte.Content> {}
export interface DropdownMenuItemProps extends ComponentProps<typeof Kobalte.Item> {}
export interface DropdownMenuSeparatorProps extends ComponentProps<typeof Kobalte.Separator> {}
export interface DropdownMenuGroupLabelProps extends ComponentProps<typeof Kobalte.GroupLabel> {}

function DropdownMenuRoot(props: DropdownMenuProps) {
  return <Kobalte {...props} data-component="dropdown-menu" />;
}

function DropdownMenuTrigger(props: ParentProps<DropdownMenuTriggerProps>) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  return (
    <Kobalte.Trigger
      {...rest}
      data-slot="dropdown-menu-trigger"
      classList={{
        ...(local.classList ?? {}),
        [local.class ?? ""]: !!local.class,
      }}
    >
      {local.children}
    </Kobalte.Trigger>
  );
}

function DropdownMenuPortal(props: ComponentProps<typeof Kobalte.Portal>) {
  return <Kobalte.Portal {...props} />;
}

function DropdownMenuContent(props: ParentProps<DropdownMenuContentProps>) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  return (
    <Kobalte.Content
      {...rest}
      data-component="dropdown-menu-content"
      classList={{
        ...(local.classList ?? {}),
        [local.class ?? ""]: !!local.class,
      }}
    >
      {local.children}
    </Kobalte.Content>
  );
}

function DropdownMenuItem(props: ParentProps<DropdownMenuItemProps>) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  return (
    <Kobalte.Item
      {...rest}
      data-slot="dropdown-menu-item"
      classList={{
        ...(local.classList ?? {}),
        [local.class ?? ""]: !!local.class,
      }}
    >
      {local.children}
    </Kobalte.Item>
  );
}

function DropdownMenuSeparator(props: DropdownMenuSeparatorProps) {
  const [local, rest] = splitProps(props, ["class", "classList"]);
  return (
    <Kobalte.Separator
      {...rest}
      data-slot="dropdown-menu-separator"
      classList={{
        ...(local.classList ?? {}),
        [local.class ?? ""]: !!local.class,
      }}
    />
  );
}

function DropdownMenuGroupLabel(props: ParentProps<DropdownMenuGroupLabelProps>) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  return (
    <Kobalte.GroupLabel
      {...rest}
      data-slot="dropdown-menu-group-label"
      classList={{
        ...(local.classList ?? {}),
        [local.class ?? ""]: !!local.class,
      }}
    >
      {local.children}
    </Kobalte.GroupLabel>
  );
}

function DropdownMenuItemLabel(props: ParentProps<ComponentProps<"span">>) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  return (
    <span
      {...rest}
      data-slot="dropdown-menu-item-label"
      classList={{
        ...(local.classList ?? {}),
        [local.class ?? ""]: !!local.class,
      }}
    >
      {local.children}
    </span>
  );
}

export const DropdownMenu = Object.assign(DropdownMenuRoot, {
  Trigger: DropdownMenuTrigger,
  Portal: DropdownMenuPortal,
  Content: DropdownMenuContent,
  Item: DropdownMenuItem,
  ItemLabel: DropdownMenuItemLabel,
  Separator: DropdownMenuSeparator,
  GroupLabel: DropdownMenuGroupLabel,
});
