import { createSignal } from "solid-js";
import type { AppSettings, CodexDoctorResult } from "../types";
import { getAppSettings, runCodexDoctor, updateAppSettings } from "../services/tauri";

const UI_SCALE_MIN = 0.1;
const UI_SCALE_MAX = 3;
const UI_SCALE_STEP = 0.1;

const defaultSettings: AppSettings = {
  codexBin: null,
  defaultAccessMode: "current",
  uiScale: 1,
  experimentalSteerEnabled: false,
};

function clampUiScale(value: number): number {
  if (!Number.isFinite(value)) {
    return defaultSettings.uiScale;
  }
  const rounded = Math.round(value / UI_SCALE_STEP) * UI_SCALE_STEP;
  const clamped = Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, rounded));
  return Number(clamped.toFixed(1));
}

function normalizeSettings(settings: AppSettings): AppSettings {
  return {
    ...settings,
    uiScale: clampUiScale(settings.uiScale),
    codexBin: settings.codexBin?.trim() ? settings.codexBin.trim() : null,
    experimentalSteerEnabled: Boolean(settings.experimentalSteerEnabled),
  };
}

export type AppSettingsStore = {
  settings: () => AppSettings;
  isLoading: () => boolean;
  error: () => string | null;
  doctorResult: () => CodexDoctorResult | null;
  isDoctorLoading: () => boolean;
  doctorError: () => string | null;
  refresh: () => Promise<void>;
  save: (settings: AppSettings) => Promise<AppSettings>;
  doctor: (codexBin: string | null) => Promise<CodexDoctorResult>;
};

export function createAppSettingsStore(): AppSettingsStore {
  const [settings, setSettings] = createSignal<AppSettings>(defaultSettings);
  const [isLoading, setIsLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [doctorResult, setDoctorResult] = createSignal<CodexDoctorResult | null>(
    null,
  );
  const [isDoctorLoading, setIsDoctorLoading] = createSignal(false);
  const [doctorError, setDoctorError] = createSignal<string | null>(null);

  async function refresh(): Promise<void> {
    setIsLoading(true);
    setError(null);
    try {
      const response = await getAppSettings();
      setSettings(
        normalizeSettings({
          ...defaultSettings,
          ...response,
        }),
      );
    } catch (err) {
      setSettings(defaultSettings);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }

  async function save(next: AppSettings): Promise<AppSettings> {
    const normalized = normalizeSettings(next);
    const saved = await updateAppSettings(normalized);
    setSettings(
      normalizeSettings({
        ...defaultSettings,
        ...saved,
      }),
    );
    setError(null);
    return saved;
  }

  async function doctor(codexBin: string | null): Promise<CodexDoctorResult> {
    setIsDoctorLoading(true);
    setDoctorError(null);
    try {
      const result = await runCodexDoctor(codexBin);
      setDoctorResult(result);
      return result;
    } catch (err) {
      setDoctorResult(null);
      setDoctorError(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      setIsDoctorLoading(false);
    }
  }

  void refresh();

  return {
    settings,
    isLoading,
    error,
    doctorResult,
    isDoctorLoading,
    doctorError,
    refresh,
    save,
    doctor,
  };
}
