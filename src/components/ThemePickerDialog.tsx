import { createMemo, For, Show } from "solid-js";
import { Dialog as Kobalte } from "@kobalte/core/dialog";
import { Button, Dialog, Icon, RadioGroup, useTheme, type ColorScheme } from "../ui";

export interface ThemePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SCHEME_OPTIONS: ColorScheme[] = ["light", "dark", "system"];

export function ThemePickerDialog(props: ThemePickerDialogProps) {
  const theme = useTheme();

  const themeList = createMemo(() => {
    const themes = theme.themes();
    return Object.entries(themes).map(([id, t]) => ({
      id,
      name: t.name,
    }));
  });

  const handleThemeChange = (id: string) => {
    theme.previewTheme(id);
  };

  const handleSchemeChange = (scheme: ColorScheme | undefined) => {
    if (scheme) {
      theme.previewColorScheme(scheme);
    }
  };

  const handleApply = () => {
    theme.commitPreview();
    props.onOpenChange(false);
  };

  const handleCancel = () => {
    theme.cancelPreview();
    props.onOpenChange(false);
  };

  return (
    <Kobalte open={props.open} onOpenChange={(open) => {
      if (!open) {
        theme.cancelPreview();
      }
      props.onOpenChange(open);
    }}>
      <Kobalte.Portal>
        <Kobalte.Overlay data-slot="dialog-overlay" />
        <Dialog title="Theme" class="w-[420px] max-h-[80vh]">
          <div class="flex flex-col gap-6">
            {/* Color Scheme */}
            <div class="flex flex-col gap-2">
              <div class="text-13-medium text-text-weak">Color Scheme</div>
              <RadioGroup
                options={SCHEME_OPTIONS}
                current={theme.colorScheme()}
                onSelect={handleSchemeChange}
                label={(s) => s.charAt(0).toUpperCase() + s.slice(1)}
                size="small"
              />
            </div>

            {/* Theme List */}
            <div class="flex flex-col gap-2">
              <div class="text-13-medium text-text-weak">Theme</div>
              <div class="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto pr-2">
                <For each={themeList()}>
                  {(t) => {
                    const isSelected = () => t.id === theme.themeId();
                    return (
                      <button
                        type="button"
                        class="flex items-center gap-3 p-3 rounded-lg border transition-colors text-left"
                        classList={{
                          "border-border-interactive-base bg-surface-interactive-weak": isSelected(),
                          "border-border-weak-base bg-surface-base hover:bg-surface-raised-base-hover": !isSelected(),
                        }}
                        onClick={() => handleThemeChange(t.id)}
                      >
                        <ThemePreviewSwatch themeId={t.id} />
                        <div class="flex flex-col min-w-0 flex-1">
                          <span class="text-14-medium text-text-strong truncate">{t.name}</span>
                        </div>
                        <Show when={isSelected()}>
                          <Icon name="check" size="small" class="ml-auto shrink-0 text-icon-interactive-base" />
                        </Show>
                      </button>
                    );
                  }}
                </For>
              </div>
            </div>

            {/* Actions */}
            <div class="flex justify-end gap-2 pt-2 border-t border-border-weak-base">
              <Button variant="secondary" onClick={handleCancel}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleApply}>
                Apply
              </Button>
            </div>
          </div>
        </Dialog>
      </Kobalte.Portal>
    </Kobalte>
  );
}

function ThemePreviewSwatch(props: { themeId: string }) {
  const theme = useTheme();

  const colors = createMemo(() => {
    const t = theme.themes()[props.themeId];
    if (!t) return null;
    const isDark = theme.mode() === "dark";
    const variant = isDark ? t.dark : t.light;
    const seeds = variant?.seeds;
    if (!seeds) return null;
    return {
      neutral: seeds.neutral,
      primary: seeds.primary,
      interactive: seeds.interactive,
      success: seeds.success,
    };
  });

  return (
    <Show when={colors()} fallback={<div class="w-8 h-8 rounded bg-surface-inset-base" />}>
      {(c) => (
        <div class="w-8 h-8 rounded overflow-hidden flex flex-wrap shrink-0">
          <div class="w-4 h-4" style={{ "background-color": c().neutral }} />
          <div class="w-4 h-4" style={{ "background-color": c().primary }} />
          <div class="w-4 h-4" style={{ "background-color": c().interactive }} />
          <div class="w-4 h-4" style={{ "background-color": c().success }} />
        </div>
      )}
    </Show>
  );
}
