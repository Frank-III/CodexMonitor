import { makePersisted } from "@solid-primitives/storage";
import { createSignal } from "solid-js";

const DEFAULT_SIZES = [0.22, 0.55, 0.23];

export function createResizableSizes() {
  const [sizes, setSizes] = makePersisted(createSignal(DEFAULT_SIZES), {
    name: "codexmonitor.panelSizes",
  });

  return { sizes, setSizes };
}
