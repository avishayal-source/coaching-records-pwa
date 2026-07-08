/** Escape a string for use inside single quotes in a Drive API `q` parameter. */
export function escapeDriveQuery(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export function friendlyDriveError(raw: string, status: number): string {
  try {
    const parsed = JSON.parse(raw) as {
      error?: { message?: string; errors?: Array<{ reason?: string }> };
    };
    const reason = parsed.error?.errors?.[0]?.reason;
    if (reason === "parseError") {
      return "Could not search Google Drive. Try saving again.";
    }
    if (parsed.error?.message) {
      return parsed.error.message;
    }
  } catch {
    /* use fallback */
  }
  return raw || `Google Drive error (${status})`;
}
