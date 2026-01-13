import { Button as Kobalte } from "@kobalte/core/button";
import { type ComponentProps, splitProps, type JSX } from "solid-js";

export interface IconButtonProps extends ComponentProps<typeof Kobalte> {
  size?: "normal" | "large";
  variant?: "primary" | "secondary" | "ghost";
  class?: string;
  classList?: Record<string, boolean>;
  children?: JSX.Element;
}

export function IconButton(props: IconButtonProps) {
  const [split, rest] = splitProps(props, ["variant", "size", "class", "classList", "children"]);
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
      {split.children}
    </Kobalte>
  );
}
