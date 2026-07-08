import {
  clearAccessToken,
  loadAccessToken,
  saveAccessToken,
} from "../storage/local";
import { getGoogleConfig } from "../config/google-config";

const SCOPES = "https://www.googleapis.com/auth/drive.file";

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (response: {
              access_token?: string;
              error?: string;
            }) => void;
          }): { requestAccessToken: (options?: { prompt?: string }) => void };
          revoke: (token: string, callback: () => void) => void;
        };
      };
    };
  }
}

function requireClientId(): string {
  const config = getGoogleConfig();
  if (!config) {
    throw new Error("App is not configured for Google sign-in.");
  }
  return config.clientId;
}

function waitForGoogle(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (window.google?.accounts?.oauth2) {
        window.clearInterval(timer);
        resolve();
      } else if (attempts > 100) {
        window.clearInterval(timer);
        reject(new Error("Google sign-in could not load. Check your internet connection."));
      }
    }, 100);
  });
}

export async function ensureAccessToken(
  interactive = true,
): Promise<string> {
  const existing = loadAccessToken();
  if (existing) return existing;

  if (!interactive) {
    throw new Error("Not signed in.");
  }

  await waitForGoogle();

  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: requireClientId(),
      scope: SCOPES,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error ?? "Sign-in was cancelled."));
          return;
        }
        saveAccessToken(response.access_token);
        resolve(response.access_token);
      },
    });
    client.requestAccessToken({ prompt: "" });
  });
}

export async function signIn(): Promise<string> {
  clearAccessToken();
  await waitForGoogle();
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: requireClientId(),
      scope: SCOPES,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error ?? "Sign-in was cancelled."));
          return;
        }
        saveAccessToken(response.access_token);
        resolve(response.access_token);
      },
    });
    client.requestAccessToken({ prompt: "consent" });
  });
}

export function signOut(): void {
  const token = loadAccessToken();
  if (token && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(token, () => {
      clearAccessToken();
    });
  } else {
    clearAccessToken();
  }
}

export function isSignedIn(): boolean {
  return Boolean(loadAccessToken());
}
