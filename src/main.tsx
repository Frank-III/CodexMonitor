/* @refresh reload */
import { render } from "solid-js/web";
import App from "./App";
import { logFrontendError } from "./services/tauri";

function showFatalOverlay(message: string, stack?: string) {
  const preExisting = document.getElementById("codexmonitor-fatal-overlay");
  const overlay = preExisting ?? document.createElement("div");
  overlay.id = "codexmonitor-fatal-overlay";
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.zIndex = "999999";
  overlay.style.background = "rgba(10, 12, 18, 0.92)";
  overlay.style.color = "rgba(255, 255, 255, 0.9)";
  overlay.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
  overlay.style.fontSize = "12px";
  overlay.style.padding = "20px";
  overlay.style.overflow = "auto";
  overlay.textContent = (stack ?? message).trim();

  if (!preExisting) {
    document.body.appendChild(overlay);
  }
}

async function ensureTauriMockForBrowser() {
  if ("__TAURI_INTERNALS__" in window) {
    return;
  }
  document.documentElement.dataset.codexmonitorEnv = "browser";
  const { mockIPC, mockWindows } = await import("@tauri-apps/api/mocks");
  mockWindows("main");
  mockIPC((cmd) => {
    if (cmd === "list_workspaces") {
      return [];
    }
    return null;
  }, { shouldMockEvents: true });
}

window.addEventListener("error", (event) => {
  const message = event.error instanceof Error ? event.error.message : event.message;
  const stack = event.error instanceof Error ? event.error.stack : undefined;
  void logFrontendError(message, stack);
  showFatalOverlay(message, stack);
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  const message = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : undefined;
  void logFrontendError(message, stack);
  showFatalOverlay(message, stack);
});

ensureTauriMockForBrowser()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    showFatalOverlay(message, stack);
  })
  .finally(() => {
    render(() => <App />, document.getElementById("root") as HTMLElement);
  });
