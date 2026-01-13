import { type ComponentProps, splitProps, type JSX } from "solid-js";

export interface CardProps extends ComponentProps<"div"> {
  variant?: "normal" | "error" | "warning" | "success" | "info";
  class?: string;
  classList?: Record<string, boolean>;
  children?: JSX.Element;
}

export function Card(props: CardProps) {
  const [split, rest] = splitProps(props, ["variant", "class", "classList", "children"]);
  return (
    <div
      {...rest}
      data-component="card"
      data-variant={split.variant || "normal"}
      classList={{
        ...(split.classList ?? {}),
        [split.class ?? ""]: !!split.class,
      }}
    >
      {split.children}
    </div>
  );
}
