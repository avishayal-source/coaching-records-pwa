const DEFAULT_BACKUP_FOLDER = "Coaching Session Records";

export interface GoogleAppConfig {
  clientId: string;
}

export interface SessionRecord {
  version: 1;
  firstName: string;
  lastName: string;
  /** ISO date YYYY-MM-DD */
  date: string;
  sessionSummary: string;
  updatedAt: string;
}

export interface DriveFileRef {
  id: string;
  name: string;
  modifiedTime?: string;
}

export interface AppSettings {
  driveFolderId: string;
  driveFolderName: string;
}

export interface DraftState {
  record: SessionRecord;
  driveFileId?: string;
  patientFolderId?: string;
  lastEditedAt: number;
  lastVerifiedBackupAt: number;
  dirty: boolean;
  /** Backup starts only after the user opens or edits session summary */
  summarySectionReached: boolean;
}

export type BackupStatus = "idle" | "saving" | "verified" | "error";

export type Screen = "home" | "setup" | "editor" | "patients" | "records";

export { DEFAULT_BACKUP_FOLDER };
