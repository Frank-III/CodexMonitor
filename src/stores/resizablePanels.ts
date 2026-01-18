import { makePersisted } from "@solid-primitives/storage";
import { createSignal } from "solid-js";

const DEFAULT_SIZES = [0.22, 0.55, 0.23];

export function createResizableSizes() {
  const [sizes, setSizesInternal] = makePersisted(createSignal(DEFAULT_SIZES), {
    name: "codexmonitor.panelSizes",
    // Custom serializer to ensure we're storing plain arrays
    serialize: (value: number[]) => {
      try {
        // Ensure we're dealing with a plain array of numbers
        const plain = Array.isArray(value) ? value.map(Number) : DEFAULT_SIZES;
        return JSON.stringify(plain);
      } catch {
        return JSON.stringify(DEFAULT_SIZES);
      }
    },
    deserialize: (value: string) => {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed) && parsed.every((v) => typeof v === "number")) {
          return parsed;
        }
        return DEFAULT_SIZES;
      } catch {
        return DEFAULT_SIZES;
      }
    },
  });

  // Wrapper to ensure plain array values
  const setSizes = (next: number[] | ((prev: number[]) => number[])) => {
    if (typeof next === "function") {
      setSizesInternal((prev) => {
        const result = next(prev);
        return Array.isArray(result) ? result.map(Number) : prev;
      });
    } else {
      setSizesInternal(Array.isArray(next) ? next.map(Number) : DEFAULT_SIZES);
    }
  };

  return { sizes, setSizes };
}
