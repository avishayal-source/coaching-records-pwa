const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isoToDisplay(iso: string): string {
  if (!ISO_DATE.test(iso)) return iso;
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function displayToIso(display: string): string | null {
  const match = display.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, d, m, y] = match;
  const day = Number(d);
  const month = Number(m);
  const year = Number(y);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const iso = `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const check = new Date(iso + "T12:00:00");
  if (
    check.getFullYear() !== year ||
    check.getMonth() + 1 !== month ||
    check.getDate() !== day
  ) {
    return null;
  }
  return iso;
}

export function recordFileName(isoDate: string): string {
  return `${isoDate}.json`;
}

export function formatBackupTime(ts: number): string {
  if (!ts) return "Never";
  return new Date(ts).toLocaleString();
}
