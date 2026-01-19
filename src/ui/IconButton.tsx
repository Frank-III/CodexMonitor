import { Button as Kobalte } from "@kobalte/core/button";
import { type ComponentProps, Show, splitProps } from "solid-js";
import { Icon, type IconProps } from "./Icon";

export interface IconButtonProps extends ComponentProps<typeof Kobalte> {
  size?: "normal" | "large";
  variant?: "primary" | "secondary" | "ghost";
  icon?: IconProps["name"];
}

export function IconButton(props: IconButtonProps) {
  const [split, rest] = splitProps(props, ["variant", "size", "icon", "class", "classList", "children"]);
  return (
    <Kobalte
      {...rest}
      data-component="icon-button"
      data-size={split.size || "normal"}
      data-variant={split.variant || "ghost"}
      classList={{
        ...(split.classList ?? {}),
        [split.class ?? ""]: !!split.class,
      }}
    >
      <Show when={split.icon}>
        <Icon name={split.icon!} size="small" />
      </Show>
      {split.children}
    </Kobalte>
  );
}
