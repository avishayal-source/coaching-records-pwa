import type { AppSettings, DraftState, GoogleAppConfig } from "../types";

const SETTINGS_KEY = "coaching-records:settings";
const DRAFT_KEY = "coaching-records:draft";
const GOOGLE_CONFIG_KEY = "coaching-records:google-config";

export function loadGoogleConfigFromStorage(): GoogleAppConfig | null {
  const raw = localStorage.getItem(GOOGLE_CONFIG_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as GoogleAppConfig;
    return parsed.clientId ? parsed : null;
  } catch {
    return null;
  }
}

export function saveGoogleConfigToStorage(config: GoogleAppConfig): void {
  localStorage.setItem(GOOGLE_CONFIG_KEY, JSON.stringify(config));
}

export function loadSettings(): AppSettings | null {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AppSettings;
  } catch {
    return null;
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadDraft(): DraftState | null {
  const raw = localStorage.getItem(DRAFT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DraftState;
  } catch {
    return null;
  }
}

export function saveDraft(draft: DraftState): void {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export function clearDraft(): void {
  localStorage.removeItem(DRAFT_KEY);
}

export function loadAccessToken(): string | null {
  return sessionStorage.getItem("coaching-records:access-token");
}

export function saveAccessToken(token: string): void {
  sessionStorage.setItem("coaching-records:access-token", token);
}

export function clearAccessToken(): void {
  sessionStorage.removeItem("coaching-records:access-token");
}
