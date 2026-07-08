import { patientFolderName } from "./patient";
import { recordFileName } from "./date";

export function sessionSavePath(
  backupFolderName: string,
  firstName: string,
  lastName: string,
  isoDate: string,
): string {
  const client = patientFolderName(firstName, lastName);
  const file = recordFileName(isoDate);
  return `Google Drive / ${backupFolderName} / ${client} / ${file}`;
}
