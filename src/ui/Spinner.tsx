import { type ComponentProps, splitProps } from "solid-js";

export interface SpinnerProps extends ComponentProps<"div"> {
  size?: "small" | "normal" | "large";
}

export function Spinner(props: SpinnerProps) {
  const [split, rest] = splitProps(props, ["size", "class", "classList"]);
  return (
    <div
      {...rest}
      data-component="spinner"
      data-size={split.size || "normal"}
      classList={{
        ...(split.classList ?? {}),
        [split.class ?? ""]: !!split.class,
      }}
    >
      <div data-slot="spinner-inner" />
    </div>
  );
}
