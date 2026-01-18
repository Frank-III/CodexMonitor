import { Show } from "solid-js";
import { createStore } from "solid-js/store";
import type { AccessMode, AppSettings, CodexDoctorResult } from "../types";

type SettingsViewProps = {
  open: boolean;
  isLoading: boolean;
  error: string | null;
  settings: AppSettings;
  doctorResult: CodexDoctorResult | null;
  isDoctorLoading: boolean;
  doctorError: string | null;
  onClose: () => void;
  onSave: (settings: AppSettings) => Promise<void>;
  onDoctor: (codexBin: string | null) => Promise<void>;
};

export function SettingsView(props: SettingsViewProps) {
  return (
    <Show when={props.open}>
      <SettingsViewContent {...props} />
    </Show>
  );
}

function SettingsViewContent(props: SettingsViewProps) {
  const [state, setState] = createStore<{
    codexBin: string;
    defaultAccessMode: AccessMode;
    uiScale: number;
    experimentalSteerEnabled: boolean;
    isSaving: boolean;
    saveError: string | null;
  }>({
    codexBin: props.settings.codexBin ?? "",
    defaultAccessMode: props.settings.defaultAccessMode,
    uiScale: props.settings.uiScale,
    experimentalSteerEnabled: props.settings.experimentalSteerEnabled,
    isSaving: false,
    saveError: null,
  });

  const handleSave = async () => {
    if (props.isLoading) {
      return;
    }
    setState({ isSaving: true, saveError: null });
    try {
      await props.onSave({
        codexBin: state.codexBin.trim() ? state.codexBin.trim() : null,
        defaultAccessMode: state.defaultAccessMode,
        uiScale: state.uiScale,
        experimentalSteerEnabled: state.experimentalSteerEnabled,
      });
      props.onClose();
    } catch (err) {
      setState("saveError", err instanceof Error ? err.message : String(err));
    } finally {
      setState("isSaving", false);
    }
  };

  const handleDoctor = async () => {
    setState("saveError", null);
    try {
      await props.onDoctor(state.codexBin.trim() ? state.codexBin.trim() : null);
    } catch {
      // Errors are surfaced via props.doctorError.
    }
  };

  return (
    <div
      class="absolute inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.45)] backdrop-blur-[12px] backdrop-saturate-[120%] [-webkit-app-region:no-drag]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) {
          props.onClose();
        }
      }}
    >
      <div
        class="w-[calc(100vw-40px)] max-w-[560px] max-h-[calc(100vh-80px)] overflow-auto rounded-[14px] border border-white/10 bg-[rgba(18,22,32,0.98)] p-[14px] shadow-[0_18px_36px_rgba(0,0,0,0.35)]"
        role="dialog"
        aria-modal="true"
      >
          <div class="mb-[10px] flex items-center justify-between gap-3">
            <div class="text-[12px] font-bold uppercase tracking-[0.1em] text-white/70">
              Settings
            </div>
            <button
              type="button"
              class="ghost icon-button"
              onClick={props.onClose}
              aria-label="Close settings"
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linecap="round"
                />
              </svg>
            </button>
          </div>

          <Show when={props.isLoading}>
            <div class="px-[6px] py-[18px] text-[12px] text-white/60">
              Loading…
            </div>
          </Show>

          <Show when={!props.isLoading}>
            <div class="flex flex-col gap-[14px] px-[2px] pb-[10px] pt-[6px]">
              <div class="flex flex-col gap-[6px]">
                <label class="text-[11px] text-white/70" for="settings-codex-bin">
                  Codex binary
                </label>
                <div class="flex items-center gap-[10px]">
                  <input
                    id="settings-codex-bin"
                    class="flex-1 rounded-[10px] border border-white/15 bg-white/5 px-[10px] py-[8px] text-[13px] text-white/90 outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-400/20"
                    type="text"
                    value={state.codexBin}
                    placeholder="codex"
                    onInput={(event) => setState("codexBin", event.currentTarget.value)}
                    spellcheck={false}
                  />
                  <button
                    type="button"
                    class="secondary"
                    onClick={handleDoctor}
                    disabled={props.isDoctorLoading}
                    title="Check Codex + Node availability"
                  >
                    {props.isDoctorLoading ? "Checking…" : "Doctor"}
                  </button>
                </div>
                <div class="text-[11px] leading-snug text-white/50">
                  Optional full path (e.g. <code>/opt/homebrew/bin/codex</code>).
                </div>
              </div>

              <div class="flex flex-col gap-[6px]">
                <label
                  class="text-[11px] text-white/70"
                  for="settings-access-mode"
                >
                  Default access mode
                </label>
                <select
                  id="settings-access-mode"
                  class="rounded-[10px] border border-white/15 bg-white/5 px-[10px] py-[8px] text-[13px] text-white/90 outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-400/20"
                  value={state.defaultAccessMode}
                  onChange={(event) =>
                    setState(
                      "defaultAccessMode",
                      event.currentTarget.value as AccessMode,
                    )
                  }
                >
                  <option value="read-only">Read-only</option>
                  <option value="current">Current workspace</option>
                  <option value="full-access">Full access</option>
                </select>
              </div>

              <div class="flex flex-col gap-[6px]">
                <label class="text-[11px] text-white/70" for="settings-ui-scale">
                  UI scale
                </label>
                <div class="grid grid-cols-[1fr_76px] items-center gap-[10px]">
                  <input
                    id="settings-ui-scale"
                    class="w-full"
                    type="range"
                    min="0.1"
                    max="3"
                    step="0.1"
                    value={state.uiScale}
                    onInput={(event) =>
                      setState("uiScale", Number(event.currentTarget.value))
                    }
                  />
                  <input
                    class="rounded-[10px] border border-white/15 bg-white/5 px-[10px] py-[8px] text-[13px] text-white/90 outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-400/20"
                    type="number"
                    min="0.1"
                    max="3"
                    step="0.1"
                    value={state.uiScale}
                    onInput={(event) =>
                      setState("uiScale", Number(event.currentTarget.value))
                    }
                  />
                </div>
              </div>

              <div class="flex flex-col gap-[6px]">
                <div class="text-[11px] font-bold uppercase tracking-[0.1em] text-white/60">
                  Experimental
                </div>
                <label class="inline-flex items-start gap-[10px] rounded-[12px] border border-white/10 bg-white/5 p-[10px] text-[12px] text-white/80">
                  <input
                    type="checkbox"
                    checked={state.experimentalSteerEnabled}
                    onChange={(event) =>
                      setState("experimentalSteerEnabled", event.currentTarget.checked)
                    }
                  />
                  <span class="flex flex-col gap-[4px]">
                    <span class="font-semibold text-white/85">Steer mode</span>
                    <span class="text-[11px] leading-snug text-white/55">
                      When enabled, you can send messages while the agent is still running. Press{" "}
                      <code>Tab</code> while running to queue instead.
                    </span>
                  </span>
                </label>
              </div>

              <Show
                when={props.error || state.saveError || props.doctorError}
              >
                <div class="whitespace-pre-wrap break-words rounded-[10px] border border-red-300/20 bg-red-300/10 p-[10px] text-[12px] text-red-200">
                  {state.saveError ||
                    props.doctorError ||
                    props.error ||
                    "Unknown error"}
                </div>
              </Show>

              <Show when={props.doctorResult}>
                {(result) => (
                  <div class="rounded-[12px] border border-white/10 bg-white/5 p-[10px]">
                    <div class="mb-[8px] flex flex-wrap items-center gap-[10px] text-[12px]">
                      <span
                        class="rounded-full border px-[8px] py-[2px] text-[11px] uppercase tracking-[0.08em]"
                        classList={{
                          "border-emerald-400/30": result().ok,
                          "bg-emerald-400/10": result().ok,
                          "text-emerald-300": result().ok,
                          "border-red-300/30": !result().ok,
                          "bg-red-300/10": !result().ok,
                          "text-red-200": !result().ok,
                        }}
                      >
                        {result().ok ? "OK" : "Check failed"}
                      </span>
                      <span class="text-white/75">
                        Codex: {result().version ?? "—"}
                      </span>
                      <span class="text-white/75">
                        Node: {result().nodeVersion ?? "—"}
                      </span>
                    </div>
                    <pre class="m-0 whitespace-pre-wrap break-words rounded-[10px] bg-black/25 p-[8px] font-mono text-[11px] text-white/65">
                      {[
                        `codexBin: ${result().codexBin ?? "null"}`,
                        `appServerOk: ${String(result().appServerOk)}`,
                        `path: ${result().path ?? "null"}`,
                        result().details ? `details: ${result().details}` : null,
                        result().nodeDetails
                          ? `nodeDetails: ${result().nodeDetails}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join("\n")}
                    </pre>
                  </div>
                )}
              </Show>
            </div>
          </Show>

          <div class="flex justify-end gap-[10px] border-t border-white/10 pt-[8px]">
            <button
              type="button"
              class="secondary"
              onClick={props.onClose}
              disabled={state.isSaving}
            >
              Cancel
            </button>
            <button
              type="button"
              class="primary"
              onClick={handleSave}
              disabled={props.isLoading || state.isSaving}
            >
              {state.isSaving ? "Saving…" : "Save"}
            </button>
          </div>
      </div>
    </div>
  );
}
