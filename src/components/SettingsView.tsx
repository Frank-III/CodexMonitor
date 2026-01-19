import { Dialog as KobalteDialog } from "@kobalte/core/dialog";
import { Show } from "solid-js";
import { createStore } from "solid-js/store";
import { Button, Checkbox, Dialog, Select, TextField } from "../ui";
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
  const accessModeOptions: { value: AccessMode; label: string }[] = [
    { value: "read-only", label: "Read-only" },
    { value: "current", label: "Current workspace" },
    { value: "full-access", label: "Full access" },
  ];

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

  const clampScale = (value: number) => Math.min(3, Math.max(0.1, value));

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

  const currentAccessModeOption = () =>
    accessModeOptions.find((option) => option.value === state.defaultAccessMode) ??
    accessModeOptions[0];

  const errorMessage = () => state.saveError || props.doctorError || props.error;

  return (
    <KobalteDialog
      modal
      open={true}
      onOpenChange={(open) => {
        if (open) return;
        props.onClose();
      }}
    >
      <KobalteDialog.Portal>
        <KobalteDialog.Overlay data-component="dialog-overlay" />
        <Dialog title="Settings">
          <div class="flex flex-col gap-4 px-6 pb-6">
            <Show when={props.isLoading} fallback={
              <>
                <div class="flex flex-col gap-4">
                  <div class="flex items-end gap-2">
                    <div class="min-w-0 flex-1">
                      <TextField
                        label="Codex binary"
                        value={state.codexBin}
                        onChange={(value) => setState("codexBin", value)}
                        placeholder="codex"
                        spellcheck={false}
                        disabled={state.isSaving}
                        description="Optional full path (e.g. /opt/homebrew/bin/codex)."
                      />
                    </div>
                    <Button
                      type="button"
                      size="large"
                      variant="secondary"
                      onClick={handleDoctor}
                      disabled={state.isSaving || props.isDoctorLoading}
                      title="Check Codex + Node availability"
                    >
                      {props.isDoctorLoading ? "Checking…" : "Doctor"}
                    </Button>
                  </div>

                  <div class="flex flex-col gap-2">
                    <div class="text-12-medium text-text-weak">Default access mode</div>
                    <Select
                      options={accessModeOptions}
                      current={currentAccessModeOption()}
                      value={(option) => option.value}
                      label={(option) => option.label}
                      onSelect={(option) => {
                        if (!option) return;
                        setState("defaultAccessMode", option.value);
                      }}
                      disabled={state.isSaving}
                      size="large"
                      variant="secondary"
                    />
                  </div>

                  <div class="flex flex-col gap-2">
                    <div class="text-12-medium text-text-weak">UI scale</div>
                    <div class="grid grid-cols-[1fr_96px] items-center gap-3">
                      <input
                        class="w-full"
                        type="range"
                        min="0.1"
                        max="3"
                        step="0.1"
                        value={state.uiScale}
                        disabled={state.isSaving}
                        onInput={(event) =>
                          setState("uiScale", clampScale(Number(event.currentTarget.value)))
                        }
                      />
                      <TextField
                        hideLabel
                        label="UI scale"
                        type="number"
                        min="0.1"
                        max="3"
                        step="0.1"
                        value={String(state.uiScale)}
                        onChange={(value) => {
                          const next = Number(value);
                          if (Number.isNaN(next)) return;
                          setState("uiScale", clampScale(next));
                        }}
                        disabled={state.isSaving}
                      />
                    </div>
                  </div>

                  <div class="flex flex-col gap-2">
                    <div class="text-12-medium uppercase tracking-wide text-text-weak">
                      Experimental
                    </div>
                    <div class="rounded-md bg-surface-base px-3 py-2">
                      <Checkbox
                        checked={state.experimentalSteerEnabled}
                        onChange={(checked) => setState("experimentalSteerEnabled", checked)}
                        disabled={state.isSaving}
                      >
                        <span class="flex flex-col gap-1">
                          <span>Steer mode</span>
                          <span class="text-12-regular text-text-weak">
                            Send messages while the agent is still running. Press <code>Tab</code>{" "}
                            while running to queue instead.
                          </span>
                        </span>
                      </Checkbox>
                    </div>
                  </div>

                  <Show when={errorMessage()}>
                    {(message) => (
                      <div class="rounded-md bg-surface-critical-weak px-3 py-2 text-13-regular text-text-on-critical-weak whitespace-pre-wrap break-words">
                        {message() || "Unknown error"}
                      </div>
                    )}
                  </Show>

                  <Show when={props.doctorResult}>
                    {(result) => (
                      <div class="rounded-md border border-border-weaker-base bg-surface-inset-base px-3 py-2">
                        <div class="flex flex-wrap items-center gap-3 text-12-regular">
                          <span
                            class="rounded-full border px-2 py-0.5 text-10-regular uppercase tracking-wide"
                            classList={{
                              "border-border-success-base": result().ok,
                              "bg-surface-success-weak": result().ok,
                              "text-text-on-success-weak": result().ok,
                              "border-border-critical-base": !result().ok,
                              "bg-surface-critical-weak": !result().ok,
                              "text-text-on-critical-weak": !result().ok,
                            }}
                          >
                            {result().ok ? "OK" : "Check failed"}
                          </span>
                          <span class="text-text-weak">
                            Codex: <span class="text-text-strong">{result().version ?? "—"}</span>
                          </span>
                          <span class="text-text-weak">
                            Node:{" "}
                            <span class="text-text-strong">{result().nodeVersion ?? "—"}</span>
                          </span>
                        </div>
                        <pre class="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border-weaker-base bg-surface-inset-base p-3 text-12-regular text-text-base">
                          {[
                            `codexBin: ${result().codexBin ?? "null"}`,
                            `appServerOk: ${String(result().appServerOk)}`,
                            `path: ${result().path ?? "null"}`,
                            result().details ? `details: ${result().details}` : null,
                            result().nodeDetails ? `nodeDetails: ${result().nodeDetails}` : null,
                          ]
                            .filter(Boolean)
                            .join("\n")}
                        </pre>
                      </div>
                    )}
                  </Show>
                </div>

                <div class="flex justify-end gap-2 pt-2">
                  <Button variant="ghost" onClick={props.onClose} disabled={state.isSaving}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleSave}
                    disabled={props.isLoading || state.isSaving}
                  >
                    {state.isSaving ? "Saving…" : "Save"}
                  </Button>
                </div>
              </>
            }>
              <div class="text-13-regular text-text-weak">Loading…</div>
            </Show>
          </div>
        </Dialog>
      </KobalteDialog.Portal>
    </KobalteDialog>
  );
}
