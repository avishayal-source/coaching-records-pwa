export function patientFolderName(firstName: string, lastName: string): string {
  const normalize = (s: string) =>
    s.trim().replace(/\s+/g, " ").replace(/[\\/:*?"<>|]/g, "");
  const last = normalize(lastName);
  const first = normalize(firstName);
  if (!last && !first) return "Unknown_Patient";
  if (!last) return first;
  if (!first) return last;
  return `${last}_${first}`;
}

export function patientDisplayName(firstName: string, lastName: string): string {
  return `${firstName.trim()} ${lastName.trim()}`.trim() || "Unknown patient";
}

export function parsePatientFolderName(folderName: string): {
  firstName: string;
  lastName: string;
} {
  const idx = folderName.indexOf("_");
  if (idx === -1) return { firstName: "", lastName: folderName };
  return {
    lastName: folderName.slice(0, idx),
    firstName: folderName.slice(idx + 1),
  };
}
