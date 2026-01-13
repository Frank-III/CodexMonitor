import { Button as Kobalte } from "@kobalte/core/button";
import { type ComponentProps, splitProps, type JSX } from "solid-js";

export interface ButtonProps extends ComponentProps<typeof Kobalte> {
  size?: "small" | "normal" | "large";
  variant?: "primary" | "secondary" | "ghost";
  class?: string;
  classList?: Record<string, boolean>;
  children?: JSX.Element;
}

export function Button(props: ButtonProps) {
  const [split, rest] = splitProps(props, ["variant", "size", "class", "classList", "children"]);
  return (
    <Kobalte
      {...rest}
      data-component="button"
      data-size={split.size || "normal"}
      data-variant={split.variant || "secondary"}
      classList={{
        ...(split.classList ?? {}),
        [split.class ?? ""]: !!split.class,
      }}
    >
      {split.children}
    </Kobalte>
  );
}
