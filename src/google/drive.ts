import type { DriveFileRef, SessionRecord } from "../types";
import { recordFileName } from "../utils/date";
import { patientFolderName } from "../utils/patient";
import { ensureAccessToken } from "./auth";
import { friendlyDriveError } from "./drive-query";

const DRIVE = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";

interface DriveListItem extends DriveFileRef {
  mimeType?: string;
}

async function driveFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = await ensureAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${DRIVE}${path}`, { ...init, headers });
  if (response.status === 401) {
    throw new Error("Session expired. Please sign in again.");
  }
  return response;
}

async function driveJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await driveFetch(path, init);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(friendlyDriveError(text, response.status));
  }
  if (response.status === 204) return {} as T;
  return response.json() as Promise<T>;
}

async function listChildren(parentId: string): Promise<DriveListItem[]> {
  const q = encodeURIComponent(`'${parentId}' in parents and trashed=false`);
  const data = await driveJson<{ files?: DriveListItem[] }>(
    `/files?q=${q}&fields=files(id,name,mimeType,modifiedTime)&pageSize=200`,
  );
  return data.files ?? [];
}

async function listFoldersUnder(parentId: string): Promise<DriveFileRef[]> {
  const children = await listChildren(parentId);
  return children
    .filter((f) => f.mimeType === FOLDER_MIME)
    .map(({ id, name, modifiedTime }) => ({ id, name, modifiedTime }));
}

export async function getFileMeta(fileId: string): Promise<DriveFileRef> {
  const data = await driveJson<{
    id: string;
    name: string;
    modifiedTime?: string;
    size?: string;
  }>(`/files/${fileId}?fields=id,name,modifiedTime,size`);
  return {
    id: data.id,
    name: data.name,
    modifiedTime: data.modifiedTime,
  };
}

export async function listPatientFolders(
  rootFolderId: string,
): Promise<DriveFileRef[]> {
  const folders = await listFoldersUnder(rootFolderId);
  return folders.sort((a, b) => a.name.localeCompare(b.name));
}

export async function listRecordFiles(
  patientFolderId: string,
): Promise<DriveFileRef[]> {
  const children = await listChildren(patientFolderId);
  return children
    .filter((f) => f.name.endsWith(".json"))
    .sort((a, b) => b.name.localeCompare(a.name));
}

export async function findFolderInRoot(name: string): Promise<DriveFileRef | null> {
  const folders = await listFoldersUnder("root");
  return folders.find((f) => f.name === name) ?? null;
}

export async function ensureBackupFolder(folderName: string): Promise<DriveFileRef> {
  const existing = await findFolderInRoot(folderName);
  if (existing) return existing;
  return createFolder("root", folderName);
}

export async function findFolderByName(
  parentId: string,
  name: string,
): Promise<DriveFileRef | null> {
  const folders = await listFoldersUnder(parentId);
  return folders.find((f) => f.name === name) ?? null;
}

export async function createFolder(
  parentId: string,
  name: string,
): Promise<DriveFileRef> {
  const data = await driveJson<{ id: string; name: string }>("/files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: FOLDER_MIME,
      parents: [parentId],
    }),
  });
  return { id: data.id, name: data.name };
}

export async function ensurePatientFolder(
  rootFolderId: string,
  firstName: string,
  lastName: string,
): Promise<DriveFileRef> {
  const name = patientFolderName(firstName, lastName);
  const existing = await findFolderByName(rootFolderId, name);
  if (existing) return existing;
  return createFolder(rootFolderId, name);
}

export async function findRecordFile(
  patientFolderId: string,
  isoDate: string,
): Promise<DriveFileRef | null> {
  const target = recordFileName(isoDate);
  const files = await listRecordFiles(patientFolderId);
  return files.find((f) => f.name === target) ?? null;
}

function recordPayload(record: SessionRecord): string {
  const payload: SessionRecord = {
    ...record,
    version: 1,
    updatedAt: new Date().toISOString(),
  };
  return JSON.stringify(payload, null, 2);
}

async function uploadRecord(
  patientFolderId: string,
  record: SessionRecord,
  existingFileId?: string,
): Promise<DriveFileRef> {
  const name = recordFileName(record.date);
  const body = recordPayload(record);
  const token = await ensureAccessToken();
  const metadata = {
    name,
    mimeType: "application/json",
    ...(existingFileId ? {} : { parents: [patientFolderId] }),
  };

  const form = new FormData();
  form.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" }),
  );
  form.append("file", new Blob([body], { type: "application/json" }));

  const url = existingFileId
    ? `${UPLOAD}/files/${existingFileId}?uploadType=multipart&fields=id,name,modifiedTime`
    : `${UPLOAD}/files?uploadType=multipart&fields=id,name,modifiedTime`;

  const response = await fetch(url, {
    method: existingFileId ? "PATCH" : "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(friendlyDriveError(text, response.status));
  }

  const data = (await response.json()) as {
    id: string;
    name: string;
    modifiedTime?: string;
  };
  return { id: data.id, name: data.name, modifiedTime: data.modifiedTime };
}

export async function downloadRecord(fileId: string): Promise<SessionRecord> {
  const response = await driveFetch(`/files/${fileId}?alt=media`);
  if (!response.ok) {
    throw new Error("Could not load record from Drive.");
  }
  const record = (await response.json()) as SessionRecord;
  if (!record.firstName || !record.date) {
    throw new Error("Invalid record file.");
  }
  return record;
}

export interface BackupResult {
  file: DriveFileRef;
  patientFolder: DriveFileRef;
  verified: boolean;
}

export async function backupRecord(
  rootFolderId: string,
  record: SessionRecord,
  existing?: { fileId?: string; patientFolderId?: string },
): Promise<BackupResult> {
  const patientFolder = await ensurePatientFolder(
    rootFolderId,
    record.firstName,
    record.lastName,
  );

  // Use known file id from draft when updating; skip Drive search on save.
  let fileId = existing?.fileId;
  if (existing?.patientFolderId && existing.patientFolderId !== patientFolder.id) {
    fileId = undefined;
  }

  const file = await uploadRecord(patientFolder.id, record, fileId);

  const meta = await getFileMeta(file.id);
  const verified =
    meta.id === file.id &&
    meta.name === recordFileName(record.date) &&
    Boolean(meta.modifiedTime);

  return { file, patientFolder, verified };
}
