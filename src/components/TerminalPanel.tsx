import { Show, createEffect, createSignal, on, onCleanup, onMount } from "solid-js";
import { Button } from "../ui";

type TerminalPanelProps = {
  workspaceId: string;
  title?: string;
  initialBuffer: string;
  isOpen: boolean;
  isOpening: boolean;
  error: string | null;
  onOpen: (cols: number, rows: number) => Promise<void>;
  onClose: () => Promise<void>;
  onClearBuffer: () => void;
  onWrite: (data: string) => Promise<void>;
  onResize: (cols: number, rows: number) => Promise<void>;
  onSubscribe: (onData: (data: string) => void) => () => void;
};

export function TerminalPanel(props: TerminalPanelProps) {
  let container: HTMLDivElement | undefined;
  const [isReady, setIsReady] = createSignal(false);
  const [uiError, setUiError] = createSignal<string | null>(null);

  let term: import("ghostty-web").Terminal | null = null;
  let fitAddon: import("ghostty-web").FitAddon | null = null;
  let outputUnsubscribe: (() => void) | null = null;
  let dataDisposable: { dispose: () => void } | null = null;
  let resizeDisposable: { dispose: () => void } | null = null;
  let pointerDownHandler: ((event: PointerEvent) => void) | null = null;

  const disposeTerminal = async () => {
    outputUnsubscribe?.();
    outputUnsubscribe = null;
    dataDisposable?.dispose();
    dataDisposable = null;
    resizeDisposable?.dispose();
    resizeDisposable = null;
    if (pointerDownHandler && container) {
      container.removeEventListener("pointerdown", pointerDownHandler);
    }
    pointerDownHandler = null;
    fitAddon?.dispose();
    fitAddon = null;
    term?.dispose();
    term = null;
    setIsReady(false);
  };

  const copySelection = async () => {
    const selection = (term as any)?.getSelection?.() as string | undefined;
    const text = selection?.trim();
    if (!text) return false;

    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback for older WebKit builds.
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      return ok;
    }
  };

  const pasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      await props.onWrite(text);
    } catch {
      // ignore
    }
  };

  const startTerminal = async () => {
    if (!container || term) return;
    setUiError(null);
    try {
      const mod = await import("ghostty-web");
      const wasmUrl = (await import("ghostty-web/ghostty-vt.wasm?url")).default;
      const ghostty = await mod.Ghostty.load(wasmUrl);

      term = new mod.Terminal({
        cursorBlink: true,
        cursorStyle: "bar",
        fontSize: 12,
        fontFamily:
          'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace)',
        allowTransparency: true,
        scrollback: 10_000,
        ghostty,
        theme: {
          background: "rgba(0,0,0,0)",
          foreground: "rgba(255,255,255,0.85)",
          cursor: "rgba(255,255,255,0.85)",
          selectionBackground: "rgba(100, 200, 255, 0.25)",
        },
      });

      fitAddon = new mod.FitAddon();
      term.loadAddon(fitAddon);
      term.open(container);
      fitAddon.fit();
      fitAddon.observeResize();

      pointerDownHandler = () => {
        term?.focus();
      };
      container.addEventListener("pointerdown", pointerDownHandler);

      term.attachCustomKeyEventHandler((event) => {
        const key = event.key.toLowerCase();

        // Allow ctrl-` to be handled by the app (toggle terminal panel).
        if (event.ctrlKey && !event.metaKey && !event.altKey && key === "`") {
          return true;
        }

        const isCopy =
          (event.metaKey && !event.ctrlKey && !event.altKey && key === "c") ||
          (event.ctrlKey && event.shiftKey && !event.metaKey && !event.altKey && key === "c");
        if (isCopy) {
          const hasSelection = (term as any)?.hasSelection?.() as boolean | undefined;
          if (!hasSelection) {
            return false;
          }
          void copySelection();
          return true;
        }

        const isPaste =
          (event.metaKey && !event.ctrlKey && !event.altKey && key === "v") ||
          (event.ctrlKey && event.shiftKey && !event.metaKey && !event.altKey && key === "v");
        if (isPaste) {
          void pasteClipboard();
          return true;
        }

        return false;
      });

      const cols = Math.max(2, term.cols || 80);
      const rows = Math.max(2, term.rows || 24);
      await props.onOpen(cols, rows);

      if (props.initialBuffer.trim()) {
        term.write(props.initialBuffer);
      }

      outputUnsubscribe = props.onSubscribe((data) => {
        term?.write(data);
      });

      dataDisposable = term.onData((data) => {
        void props.onWrite(data);
      });
      resizeDisposable = term.onResize(({ cols, rows }) => {
        void props.onResize(cols, rows);
      });

      setIsReady(true);
      term.focus();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setUiError(message);
      await disposeTerminal();
    }
  };

  onMount(() => {
    void startTerminal();
  });

  createEffect(
    on(
      () => props.workspaceId,
      () => {
        void disposeTerminal().then(() => startTerminal());
      },
      { defer: true },
    ),
  );

  onCleanup(() => {
    void disposeTerminal();
  });

  createEffect(() => {
    if (!isReady()) return;
    if (!term) return;
    // Keep focus within the terminal when it's visible.
    term.focus();
  });

  return (
    <div class="terminal-panel">
      <div class="terminal-header">
        <div class="terminal-title">{props.title ?? "Terminal"}</div>
        <div class="terminal-actions">
          <Button
            type="button"
            variant="ghost"
            size="small"
            class="terminal-action"
            onClick={() => {
              if (!term) return;
              // xterm-compatible clear: write ANSI clear + reset scrollback position.
              term.write("\u001b[2J\u001b[H");
              props.onClearBuffer();
            }}
            disabled={!isReady()}
          >
            Clear
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="small"
            class="terminal-action"
            onClick={async () => {
              await props.onClose();
              await disposeTerminal();
            }}
            disabled={props.isOpening}
          >
            Close
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="small"
            class="terminal-action"
            onClick={async () => {
              await props.onClose();
              await disposeTerminal();
              await startTerminal();
            }}
            disabled={props.isOpening}
          >
            Restart
          </Button>
        </div>
      </div>

      <Show when={props.error || uiError()}>
        <div class="terminal-error">{props.error ?? uiError()}</div>
      </Show>

      <div class="terminal-frame">
        <Show when={!isReady()}>
          <div class="terminal-loading">
            <div class="terminal-loading-title">
              {props.isOpening ? "Starting shell…" : "Loading terminal…"}
            </div>
            <div class="terminal-loading-meta">{props.workspaceId}</div>
          </div>
        </Show>
        <div
          ref={container}
          class="terminal-container"
          data-terminal-ready={isReady() ? "true" : "false"}
        />
      </div>
    </div>
  );
}
