import { onMount, onCleanup } from "solid-js";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function setupWindowDrag(targetId: string): void {
  onMount(() => {
    const el = document.getElementById(targetId);
    if (!el) {
      return;
    }

    const handler = (event: MouseEvent) => {
      if (event.buttons !== 1) {
        return;
      }
      getCurrentWindow().startDragging();
    };

    el.addEventListener("mousedown", handler);

    onCleanup(() => {
      el.removeEventListener("mousedown", handler);
    });
  });
}
