import type { GoogleAppConfig } from "../types";
import { loadGoogleConfigFromStorage } from "../storage/local";

function fromBuildEnv(): GoogleAppConfig | null {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? "";
  if (!clientId || clientId.includes("your-client-id")) {
    return null;
  }
  return { clientId };
}

let cached: GoogleAppConfig | null = null;

export function getGoogleConfig(): GoogleAppConfig | null {
  if (cached) return cached;

  const stored = loadGoogleConfigFromStorage();
  if (stored && isValidGoogleConfig(stored)) {
    cached = stored;
    return cached;
  }

  const built = fromBuildEnv();
  if (built) {
    cached = built;
    return cached;
  }

  return null;
}

export function hasGoogleConfig(): boolean {
  return getGoogleConfig() !== null;
}

export function isValidGoogleConfig(
  config: Partial<GoogleAppConfig>,
): config is GoogleAppConfig {
  const clientId = config.clientId?.trim() ?? "";
  return clientId.endsWith(".apps.googleusercontent.com");
}

export function missingConfigMessage(): string {
  return "This app is not ready yet. Ask the person who set it up to finish deployment (Google sign-in ID is missing).";
}
