import type {
  AppSettings,
  BackupStatus,
  DraftState,
  DriveFileRef,
  Screen,
  SessionRecord,
} from "../types";
import { DEFAULT_BACKUP_FOLDER } from "../types";
import {
  backupRecord,
  downloadRecord,
  ensureBackupFolder,
  listPatientFolders,
  listRecordFiles,
} from "../google/drive";
import {
  ensureAccessToken,
  isSignedIn,
  signIn,
  signOut,
} from "../google/auth";
import {
  clearDraft,
  loadDraft,
  loadSettings,
  saveDraft,
  saveSettings,
} from "../storage/local";
import { hasGoogleConfig, missingConfigMessage } from "../config/google-config";
import {
  formatBackupTime,
  isoToDisplay,
  todayIso,
} from "../utils/date";
import {
  parsePatientFolderName,
  patientDisplayName,
} from "../utils/patient";
import { sessionSavePath } from "../utils/path";

const AUTOSAVE_MS = 60_000;

let screen: Screen = "home";
let settings: AppSettings | null = loadSettings();
const loadedDraft = loadDraft();
let draft: DraftState | null = loadedDraft ? normalizeDraft(loadedDraft) : null;
let backupStatus: BackupStatus = "idle";
let backupError = "";
let toastMessage = "";
let toastKind: "success" | "error" | "info" = "info";
let autosaveTimer: number | null = null;
let selectedPatient: DriveFileRef | null = null;
let patientFolders: DriveFileRef[] = [];
let recordFiles: DriveFileRef[] = [];
let viewingRecord: SessionRecord | null = null;
let viewingFile: DriveFileRef | null = null;
let loading = false;
let showCloseModal = false;
let showFolderModal = false;
let folderNameInput = settings?.driveFolderName ?? DEFAULT_BACKUP_FOLDER;
let setupSaving = false;
let sidebarExpandedClientId: string | null = null;
let sidebarRecordsByClient: Record<string, DriveFileRef[]> = {};
let sidebarSelectedFileId: string | null = null;
let sidebarLoading = false;

const app = document.getElementById("app")!;

function emptyRecord(): SessionRecord {
  return {
    version: 1,
    firstName: "",
    lastName: "",
    date: todayIso(),
    sessionSummary: "",
    updatedAt: new Date().toISOString(),
  };
}

function normalizeDraft(raw: DraftState): DraftState {
  return {
    ...raw,
    summarySectionReached:
      raw.summarySectionReached ??
      Boolean(raw.driveFileId || raw.record.sessionSummary.trim()),
  };
}

function showToast(message: string, kind: typeof toastKind = "info"): void {
  toastMessage = message;
  toastKind = kind;
  paintToast();
  window.setTimeout(() => {
    if (toastMessage === message) {
      toastMessage = "";
      paintToast();
    }
  }, 5000);
}

function paintToast(): void {
  let el = document.getElementById("app-toast");
  if (!el) {
    render();
    el = document.getElementById("app-toast");
  }
  if (!el) return;
  el.innerHTML = toastMessage
    ? `<div class="toast toast-${toastKind}" role="status">${escapeHtml(toastMessage)}</div>`
    : "";
}

function setBackup(status: BackupStatus, error = ""): void {
  backupStatus = status;
  backupError = error;
  if (screen === "editor" && document.getElementById("record-form")) {
    updateEditorChrome();
    return;
  }
  render();
}

function persistDraft(): void {
  if (draft) saveDraft(draft);
}

function canBackupToDrive(): boolean {
  if (!draft || !settings) return false;
  if (!draft.summarySectionReached) return false;
  if (!draft.record.firstName.trim() || !draft.record.lastName.trim()) return false;
  return Boolean(draft.record.date);
}

function markDirty(): void {
  if (!draft) return;
  draft.dirty = true;
  draft.lastEditedAt = Date.now();
  draft.record.updatedAt = new Date().toISOString();
  persistDraft();
}

function syncFormToDraft(): void {
  if (!draft) return;
  const firstNameEl = document.getElementById("firstName") as HTMLInputElement | null;
  const lastNameEl = document.getElementById("lastName") as HTMLInputElement | null;
  const dateEl = document.getElementById("sessionDate") as HTMLInputElement | null;
  const summaryEl = document.getElementById("sessionSummary") as HTMLTextAreaElement | null;
  if (!firstNameEl || !lastNameEl || !dateEl || !summaryEl) return;

  draft.record.firstName = firstNameEl.value;
  draft.record.lastName = lastNameEl.value;
  if (dateEl.value) draft.record.date = dateEl.value;
  draft.record.sessionSummary = summaryEl.value;
  markDirty();
  updateEditorChrome();
}

function readFormForSave(): boolean {
  syncFormToDraft();
  if (!draft) return false;

  if (!draft.record.firstName.trim() || !draft.record.lastName.trim()) {
    showToast("First and last name are required.", "error");
    return false;
  }
  if (!draft.record.date) {
    showToast("Please choose a session date.", "error");
    return false;
  }
  if (!draft.summarySectionReached) {
    showToast("Open the session summary section before saving.", "error");
    return false;
  }
  return true;
}

function updateEditorChrome(): void {
  const status = document.getElementById("backup-status");
  const path = document.getElementById("save-path");
  const saveBtn = document.getElementById("save-btn") as HTMLButtonElement | null;
  if (status) {
    status.textContent = backupStatusLabel();
    status.className = `status status-${backupStatus}`;
  }
  if (path && draft && settings) {
    path.textContent = sessionSavePath(
      settings.driveFolderName,
      draft.record.firstName,
      draft.record.lastName,
      draft.record.date,
    );
  }
  if (saveBtn) {
    saveBtn.disabled = !canBackupToDrive() || backupStatus === "saving";
  }
}

function readFolderNameInput(): string {
  const el = document.getElementById("folder-name-input") as HTMLInputElement | null;
  const name = el?.value.trim() ?? folderNameInput.trim();
  folderNameInput = name || DEFAULT_BACKUP_FOLDER;
  return folderNameInput;
}

async function applyBackupFolder(name: string, announce = true): Promise<boolean> {
  const trimmed = name.trim();
  if (!trimmed) {
    showToast("Please enter a folder name.", "error");
    return false;
  }

  setupSaving = true;
  render();
  try {
    const folder = await ensureBackupFolder(trimmed);
    settings = { driveFolderId: folder.id, driveFolderName: folder.name };
    saveSettings(settings);
    folderNameInput = folder.name;
    showFolderModal = false;
    if (announce) {
      showToast(`Backup folder set to "${folder.name}".`, "success");
    }
    return true;
  } catch (err) {
    showToast(
      err instanceof Error ? err.message : "Could not create backup folder.",
      "error",
    );
    return false;
  } finally {
    setupSaving = false;
    render();
  }
}

async function runBackup(announce = false): Promise<boolean> {
  if (!draft || !settings || !draft.dirty) return false;
  syncFormToDraft();
  if (!canBackupToDrive()) return false;

  setBackup("saving");

  try {
    const result = await backupRecord(settings.driveFolderId, draft.record, {
      fileId: draft.driveFileId,
      patientFolderId: draft.patientFolderId,
    });
    if (!result.verified) {
      throw new Error("Backup verification failed.");
    }
    draft.driveFileId = result.file.id;
    draft.patientFolderId = result.patientFolder.id;
    draft.lastVerifiedBackupAt = Date.now();
    draft.dirty = false;
    persistDraft();
    setBackup("verified");
    upsertSidebarAfterSave(result.patientFolder, result.file);
    void listRecordFiles(result.patientFolder.id).then((files) => {
      sidebarRecordsByClient[result.patientFolder.id] = files;
      paintSidebar();
    });
    if (announce) {
      showToast("Session saved to Google Drive.", "success");
    }
    return true;
  } catch (err) {
    setBackup("error", err instanceof Error ? err.message : "Backup failed.");
    if (announce) {
      showToast(
        err instanceof Error ? err.message : "Backup failed.",
        "error",
      );
    }
    return false;
  }
}

async function runSilentBackup(): Promise<void> {
  await runBackup(false);
}

function startAutosave(): void {
  stopAutosave();
  autosaveTimer = window.setInterval(() => {
    void runSilentBackup();
  }, AUTOSAVE_MS);
}

function stopAutosave(): void {
  if (autosaveTimer !== null) {
    window.clearInterval(autosaveTimer);
    autosaveTimer = null;
  }
}

async function finalizeAndClose(): Promise<void> {
  if (!draft || !settings) return;
  if (!readFormForSave()) return;

  setBackup("saving");
  try {
    const result = await backupRecord(settings.driveFolderId, draft.record, {
      fileId: draft.driveFileId,
      patientFolderId: draft.patientFolderId,
    });
    if (!result.verified) {
      throw new Error("Backup verification failed.");
    }
    draft.lastVerifiedBackupAt = Date.now();
    draft.dirty = false;
    upsertSidebarAfterSave(result.patientFolder, result.file);
    clearDraft();
    stopAutosave();
    draft = null;
    showCloseModal = false;
    setBackup("verified");
    screen = "home";
    showToast(
      `Session saved to Google Drive (${result.file.name}).`,
      "success",
    );
    render();
  } catch (err) {
    setBackup(
      "error",
      err instanceof Error ? err.message : "Final backup failed.",
    );
    showToast(
      "Could not verify backup. Check your connection and try again.",
      "error",
    );
  }
}

function openNewRecord(): void {
  stopAutosave();
  clearDraft();
  draft = {
    record: emptyRecord(),
    lastEditedAt: Date.now(),
    lastVerifiedBackupAt: 0,
    dirty: false,
    summarySectionReached: false,
  };
  persistDraft();
  backupStatus = "idle";
  backupError = "";
  sidebarSelectedFileId = null;
  showCloseModal = false;
  screen = "editor";
  startAutosave();
  render();
}

async function openEditorWithRecord(
  record: SessionRecord,
  file?: DriveFileRef,
  patientFolderId?: string,
): Promise<void> {
  draft = {
    record: { ...record },
    driveFileId: file?.id,
    patientFolderId,
    lastEditedAt: Date.now(),
    lastVerifiedBackupAt: Date.now(),
    dirty: false,
    summarySectionReached: true,
  };
  persistDraft();
  viewingRecord = null;
  viewingFile = null;
  screen = "editor";
  startAutosave();
  render();
}

async function loadSidebarClients(): Promise<void> {
  if (!settings) return;
  sidebarLoading = true;
  if (!document.getElementById("session-sidebar")) render();
  try {
    patientFolders = await listPatientFolders(settings.driveFolderId);
  } catch (err) {
    showToast(
      err instanceof Error ? err.message : "Could not load sessions.",
      "error",
    );
  } finally {
    sidebarLoading = false;
    render();
  }
}

async function loadSidebarSessions(folderId: string): Promise<void> {
  sidebarLoading = true;
  render();
  try {
    sidebarRecordsByClient[folderId] = await listRecordFiles(folderId);
    sidebarExpandedClientId = folderId;
  } catch (err) {
    showToast(
      err instanceof Error ? err.message : "Could not load sessions.",
      "error",
    );
  } finally {
    sidebarLoading = false;
    render();
  }
}

async function openSessionFromSidebar(
  fileId: string,
  folderId: string,
  folderName: string,
): Promise<void> {
  sidebarSelectedFileId = fileId;
  sidebarExpandedClientId = folderId;
  sidebarLoading = true;
  render();
  try {
    const record = await downloadRecord(fileId);
    selectedPatient = { id: folderId, name: folderName };
    viewingRecord = null;
    viewingFile = null;
    await openEditorWithRecord(
      record,
      { id: fileId, name: `${record.date}.json` },
      folderId,
    );
  } catch (err) {
    showToast(
      err instanceof Error ? err.message : "Could not open session.",
      "error",
    );
  } finally {
    sidebarLoading = false;
    render();
  }
}

function usesSidebar(): boolean {
  return Boolean(settings?.driveFolderId) && (screen === "home" || screen === "editor");
}

function upsertSidebarAfterSave(
  patientFolder: DriveFileRef,
  file: DriveFileRef,
): void {
  if (!patientFolders.some((f) => f.id === patientFolder.id)) {
    patientFolders = [...patientFolders, patientFolder].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }
  const sessions = sidebarRecordsByClient[patientFolder.id] ?? [];
  const rest = sessions.filter((s) => s.name !== file.name && s.id !== file.id);
  sidebarRecordsByClient[patientFolder.id] = [file, ...rest].sort((a, b) =>
    b.name.localeCompare(a.name),
  );
  sidebarExpandedClientId = patientFolder.id;
  sidebarSelectedFileId = file.id;
  paintSidebar();
}

function bindSidebarEvents(): void {
  document
    .getElementById("session-sidebar")
    ?.querySelectorAll("[data-action]")
    .forEach((el) => {
      el.addEventListener("click", (e) => {
        void handleAction(
          (e.currentTarget as HTMLElement).dataset.action ?? "",
          e.currentTarget as HTMLElement,
        );
      });
    });
}

function paintSidebar(): void {
  if (!usesSidebar()) return;
  const sidebar = document.getElementById("session-sidebar");
  if (!sidebar) {
    render();
    return;
  }
  const wrapper = document.createElement("div");
  wrapper.innerHTML = renderSessionSidebar();
  const newSidebar = wrapper.firstElementChild;
  if (newSidebar) {
    sidebar.replaceWith(newSidebar);
    bindSidebarEvents();
  }
}

function renderSessionSidebar(): string {
  if (!usesSidebar()) return "";

  const clientItems =
    patientFolders.length === 0
      ? `<p class="sidebar-empty">${sidebarLoading ? "Loading…" : "No saved sessions yet."}</p>`
      : patientFolders
          .map((folder) => {
            const { firstName, lastName } = parsePatientFolderName(folder.name);
            const label = patientDisplayName(firstName, lastName);
            const expanded = sidebarExpandedClientId === folder.id;
            const sessions = sidebarRecordsByClient[folder.id] ?? [];
            const sessionList =
              !expanded
                ? ""
                : sessions.length === 0
                  ? `<p class="sidebar-empty">${sidebarLoading ? "Loading…" : "No sessions"}</p>`
                  : `<ul class="sidebar-sessions">${sessions
                      .map((file) => {
                        const iso = file.name.replace(/\.json$/, "");
                        const active = sidebarSelectedFileId === file.id;
                        return `<li><button type="button" class="sidebar-session-btn ${active ? "active" : ""}" data-action="sidebar-open-session" data-file-id="${escapeAttr(file.id)}" data-folder-id="${escapeAttr(folder.id)}" data-folder-name="${escapeAttr(folder.name)}">${escapeHtml(isoToDisplay(iso))}</button></li>`;
                      })
                      .join("")}</ul>`;

            return `
              <div class="sidebar-client">
                <button type="button" class="sidebar-client-btn ${expanded ? "expanded" : ""}" data-action="sidebar-toggle-client" data-folder-id="${escapeAttr(folder.id)}" data-folder-name="${escapeAttr(folder.name)}">
                  <span>${escapeHtml(label)}</span>
                  <span class="sidebar-chevron">${expanded ? "▼" : "▶"}</span>
                </button>
                ${sessionList}
              </div>
            `;
          })
          .join("");

  return `
    <aside class="session-sidebar" id="session-sidebar">
      <div class="sidebar-header">
        <h2>Saved sessions</h2>
        <div class="sidebar-header-actions">
          <button type="button" class="btn-text sidebar-new" data-action="new-record" title="New session">+ New</button>
          <button type="button" class="btn-text sidebar-refresh" data-action="sidebar-refresh" title="Refresh">↻</button>
        </div>
      </div>
      <div class="sidebar-body">${clientItems}</div>
    </aside>
  `;
}

function wrapWithShell(mainContent: string): string {
  return `
    <div class="app-shell">
      ${renderSessionSidebar()}
      <div class="app-main-pane">${mainContent}</div>
    </div>
  `;
}

async function loadPatients(): Promise<void> {
  if (!settings) return;
  loading = true;
  render();
  try {
    patientFolders = await listPatientFolders(settings.driveFolderId);
  } catch (err) {
    showToast(
      err instanceof Error ? err.message : "Could not load clients.",
      "error",
    );
  } finally {
    loading = false;
    render();
  }
}

async function loadRecordsForPatient(patient: DriveFileRef): Promise<void> {
  selectedPatient = patient;
  loading = true;
  render();
  try {
    recordFiles = await listRecordFiles(patient.id);
  } catch (err) {
    showToast(
      err instanceof Error ? err.message : "Could not load records.",
      "error",
    );
  } finally {
    loading = false;
    render();
  }
}

async function viewRecord(file: DriveFileRef): Promise<void> {
  loading = true;
  render();
  try {
    viewingRecord = await downloadRecord(file.id);
    viewingFile = file;
  } catch (err) {
    showToast(
      err instanceof Error ? err.message : "Could not open record.",
      "error",
    );
  } finally {
    loading = false;
    render();
  }
}

function backupStatusLabel(): string {
  if (draft && !draft.summarySectionReached) {
    return "Local draft only — backup starts when you open session summary";
  }
  switch (backupStatus) {
    case "saving":
      return "Saving to Drive…";
    case "verified":
      return draft?.dirty
        ? "Unsaved changes (auto-backup pending)"
        : `Backed up ${formatBackupTime(draft?.lastVerifiedBackupAt ?? 0)}`;
    case "error":
      return backupError || "Backup failed";
    default:
      return draft?.dirty ? "Not yet backed up" : "Ready to save";
  }
}

function renderHeader(title: string): string {
  return `
    <header class="header">
      <span class="header-spacer"></span>
      <h1>${escapeHtml(title)}</h1>
      <span class="header-spacer"></span>
    </header>
  `;
}

function renderToastInner(): string {
  if (!toastMessage) return "";
  return `<div class="toast toast-${toastKind}" role="status">${escapeHtml(toastMessage)}</div>`;
}

function renderFolderModal(): string {
  if (!showFolderModal) return "";
  return `
    <div class="modal-backdrop" data-action="cancel-folder-modal">
      <div class="modal" role="dialog" aria-modal="true">
        <h2>Backup folder name</h2>
        <p class="muted">Session notes are saved in this folder in your Google Drive.</p>
        <label>
          Folder name
          <input id="folder-name-input" type="text" value="${escapeAttr(folderNameInput)}" />
        </label>
        <div class="modal-actions">
          <button type="button" class="btn" data-action="cancel-folder-modal">Cancel</button>
          <button type="button" class="btn primary" data-action="save-folder" ${setupSaving ? "disabled" : ""}>Save</button>
        </div>
      </div>
    </div>
  `;
}

function renderHome(): string {
  const folderLine = settings
    ? `<p class="path-display">Google Drive / <strong>${escapeHtml(settings.driveFolderName)}</strong></p>`
    : "";

  const draftBanner = draft
    ? `
      <div class="callout warning-box">
        <strong>Unfinished session</strong>
        <p>You have a session in progress.</p>
        <div class="actions row-actions">
          <button type="button" class="btn primary" data-action="continue-draft">Continue draft</button>
          <button type="button" class="btn" data-action="discard-draft">Discard & start new</button>
        </div>
      </div>
    `
    : "";

  return `
    ${renderHeader("Coaching Sessions")}
    <main class="screen">
      ${folderLine}
      ${draftBanner}
      <div class="actions">
        <button type="button" class="btn primary" data-action="new-record">New session record</button>
        <button type="button" class="btn-text" data-action="change-folder">Change backup folder name</button>
        <button type="button" class="btn-text danger" data-action="sign-out">Sign out</button>
      </div>
    </main>
    ${renderFolderModal()}
  `;
}

function renderSetup(): string {
  return `
    ${renderHeader("Almost ready")}
    <main class="screen">
      <div class="callout warning-box">
        <strong>Before you start</strong>
        <p>Session notes are backed up to Google Drive. Without a backup folder, records may not be saved properly.</p>
      </div>
      <p>We will create this folder in your Google Drive (if it doesn't exist yet):</p>
      <p class="folder-name">${escapeHtml(folderNameInput)}</p>
      <div class="actions">
        <button type="button" class="btn primary" data-action="confirm-setup" ${setupSaving ? "disabled" : ""}>
          ${setupSaving ? "Setting up…" : "Continue"}
        </button>
        <button type="button" class="btn-text" data-action="customize-folder">Use a different folder name</button>
      </div>
    </main>
    ${renderFolderModal()}
  `;
}

function renderEditor(): string {
  if (!draft) return "";
  const r = draft.record;
  const pathLabel =
    settings &&
    sessionSavePath(
      settings.driveFolderName,
      r.firstName,
      r.lastName,
      r.date,
    );
  const modal = showCloseModal
    ? `
    <div class="modal-backdrop" data-action="cancel-close">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="close-title">
        <h2 id="close-title">Save session?</h2>
        <p>Save this record to Google Drive folder:</p>
        <p class="folder-name">${escapeHtml(pathLabel ?? settings?.driveFolderName ?? "Unknown")}</p>
        <div class="modal-actions">
          <button type="button" class="btn" data-action="change-folder-close">Change folder</button>
          <button type="button" class="btn primary" data-action="confirm-close">Save & close</button>
        </div>
        <button type="button" class="btn-text" data-action="cancel-close">Keep editing</button>
      </div>
    </div>
  `
    : "";

  return `
    ${renderHeader("Session record")}
    <main class="screen">
      <div class="editor-toolbar">
        <button type="button" class="btn-text" data-action="new-record">+ New session</button>
      </div>
      <p id="save-path" class="path-display">${escapeHtml(pathLabel ?? "")}</p>
      <form class="record-form" id="record-form" novalidate>
        <label>
          Client first name
          <input id="firstName" name="firstName" type="text" autocomplete="given-name" value="${escapeAttr(r.firstName)}" required />
        </label>
        <label>
          Client last name
          <input id="lastName" name="lastName" type="text" autocomplete="family-name" value="${escapeAttr(r.lastName)}" required />
        </label>
        <label>
          Session date
          <input id="sessionDate" name="sessionDate" type="date" value="${escapeAttr(r.date)}" required />
        </label>
        <label>
          Session summary
          <textarea id="sessionSummary" name="sessionSummary" rows="10" placeholder="Notes from the coaching session…">${escapeHtml(r.sessionSummary)}</textarea>
        </label>
      </form>
      <p id="backup-status" class="status status-${backupStatus}">${escapeHtml(backupStatusLabel())}</p>
      <div class="actions row-actions">
        <button type="button" class="btn primary" id="save-btn" data-action="save-record" ${canBackupToDrive() && backupStatus !== "saving" ? "" : "disabled"}>Save</button>
        <button type="button" class="btn" data-action="close-record">Close record</button>
      </div>
    </main>
    ${modal}
    ${renderFolderModal()}
  `;
}

function renderPatients(): string {
  if (viewingRecord && viewingFile) {
    const name = patientDisplayName(
      viewingRecord.firstName,
      viewingRecord.lastName,
    );
    return `
      ${renderHeader("Session details")}
      <main class="screen">
        <button type="button" class="btn-text back-btn" data-action="back">← Back</button>
        <article class="record-view">
          <h2>${escapeHtml(name)}</h2>
          <p class="muted">Date: ${escapeHtml(isoToDisplay(viewingRecord.date))}</p>
          <h3>Session summary</h3>
          <div class="summary-box">${escapeHtml(viewingRecord.sessionSummary).replace(/\n/g, "<br>")}</div>
        </article>
        <div class="actions">
          <button type="button" class="btn primary" data-action="edit-viewed">Edit this record</button>
        </div>
      </main>
    `;
  }

  if (selectedPatient) {
    const { firstName, lastName } = parsePatientFolderName(selectedPatient.name);
    const title = patientDisplayName(firstName, lastName);
    const list =
      recordFiles.length === 0
        ? `<p class="muted">${loading ? "Loading…" : "No saved sessions for this client yet."}</p>`
        : `<ul class="list">${recordFiles
            .map((file) => {
              const iso = file.name.replace(/\.json$/, "");
              return `<li><button type="button" class="list-btn" data-action="open-record" data-file-id="${escapeAttr(file.id)}">${escapeHtml(isoToDisplay(iso))}</button></li>`;
            })
            .join("")}</ul>`;

    return `
      ${renderHeader(title)}
      <main class="screen">
        <button type="button" class="btn-text back-btn" data-action="back">← Back</button>
        <p class="muted">Tap a date to view the session.</p>
        ${list}
      </main>
    `;
  }

  const list =
    patientFolders.length === 0
      ? `<p class="muted">${loading ? "Loading…" : "No clients yet. Create a session record first."}</p>`
      : `<ul class="list">${patientFolders
          .map((folder) => {
            const { firstName, lastName } = parsePatientFolderName(folder.name);
            const label = patientDisplayName(firstName, lastName);
            return `<li><button type="button" class="list-btn" data-action="open-patient" data-folder-id="${escapeAttr(folder.id)}" data-folder-name="${escapeAttr(folder.name)}">${escapeHtml(label)}</button></li>`;
          })
          .join("")}</ul>`;

  return `
    ${renderHeader("Saved records")}
    <main class="screen">
      <button type="button" class="btn-text back-btn" data-action="back">← Back</button>
      <p class="muted">Choose a client to see their saved sessions.</p>
      ${list}
    </main>
  `;
}

function renderMissingConfig(): void {
  app.innerHTML = `
    <main class="screen landing">
      <h1>App not ready</h1>
      <p>${escapeHtml(missingConfigMessage())}</p>
    </main>
  `;
}

function render(): void {
  let content = "";
  switch (screen) {
    case "setup":
      content = renderSetup();
      break;
    case "editor":
      content = renderEditor();
      break;
    case "patients":
    case "records":
      content = renderPatients();
      break;
    default:
      content = renderHome();
  }

  if (usesSidebar()) {
    content = wrapWithShell(content);
  }

  app.innerHTML = `<div id="app-main">${content}</div><div id="app-toast">${renderToastInner()}</div>`;
  bindEvents();
}

function bindEvents(): void {
  app.querySelectorAll("[data-action]").forEach((el) => {
    el.addEventListener("click", (e) => {
      void handleAction(
        (e.currentTarget as HTMLElement).dataset.action ?? "",
        e.currentTarget as HTMLElement,
      );
    });
  });

  if (screen === "editor") {
    ["firstName", "lastName", "sessionDate", "sessionSummary"].forEach((id) => {
      const el = document.getElementById(id);
      el?.addEventListener("input", () => syncFormToDraft());
    });
    const summaryEl = document.getElementById("sessionSummary");
    summaryEl?.addEventListener("focus", () => {
      if (draft && !draft.summarySectionReached) {
        draft.summarySectionReached = true;
        persistDraft();
        updateEditorChrome();
      }
    });
  }
}

async function handleAction(action: string, el: HTMLElement): Promise<void> {
  switch (action) {
    case "back": {
      if (screen === "editor") {
        showCloseModal = true;
        render();
        return;
      }
      if (viewingRecord) {
        viewingRecord = null;
        viewingFile = null;
        render();
        return;
      }
      if (selectedPatient) {
        selectedPatient = null;
        recordFiles = [];
        render();
        return;
      }
      screen = "home";
      render();
      return;
    }
    case "sign-out":
      stopAutosave();
      signOut();
      screen = "home";
      render();
      return;
    case "new-record":
      if (!settings) {
        screen = "setup";
        render();
        return;
      }
      openNewRecord();
      return;
    case "continue-draft":
      if (draft) {
        screen = "editor";
        startAutosave();
        render();
      }
      return;
    case "discard-draft":
      openNewRecord();
      return;
    case "sidebar-refresh":
      sidebarRecordsByClient = {};
      sidebarExpandedClientId = null;
      await loadSidebarClients();
      return;
    case "sidebar-toggle-client": {
      const folderId = el.dataset.folderId!;
      if (sidebarExpandedClientId === folderId) {
        sidebarExpandedClientId = null;
        render();
        return;
      }
      if (sidebarRecordsByClient[folderId]) {
        sidebarExpandedClientId = folderId;
        render();
        return;
      }
      await loadSidebarSessions(folderId);
      return;
    }
    case "sidebar-open-session": {
      await openSessionFromSidebar(
        el.dataset.fileId!,
        el.dataset.folderId!,
        el.dataset.folderName!,
      );
      return;
    }
    case "browse":
      screen = "patients";
      selectedPatient = null;
      viewingRecord = null;
      await loadPatients();
      return;
    case "confirm-setup": {
      const ok = await applyBackupFolder(folderNameInput, true);
      if (ok) {
        screen = "home";
        render();
        void loadSidebarClients();
      }
      return;
    }
    case "customize-folder":
    case "change-folder":
    case "change-folder-close":
      showCloseModal = false;
      showFolderModal = true;
      folderNameInput = settings?.driveFolderName ?? folderNameInput;
      render();
      return;
    case "save-folder": {
      const name = readFolderNameInput();
      const ok = await applyBackupFolder(name, true);
      if (ok && screen === "setup") {
        screen = "home";
      }
      render();
      return;
    }
    case "cancel-folder-modal":
      if (el.classList.contains("modal-backdrop") || action === "cancel-folder-modal") {
        showFolderModal = false;
        render();
      }
      return;
    case "save-record":
      await runBackup(true);
      return;
    case "close-record":
      if (!settings) {
        screen = "setup";
        render();
        return;
      }
      showCloseModal = true;
      render();
      return;
    case "cancel-close":
      showCloseModal = false;
      render();
      return;
    case "confirm-close":
      await finalizeAndClose();
      return;
    case "open-patient": {
      selectedPatient = {
        id: el.dataset.folderId!,
        name: el.dataset.folderName!,
      };
      screen = "records";
      await loadRecordsForPatient(selectedPatient);
      return;
    }
    case "open-record":
      await viewRecord({ id: el.dataset.fileId!, name: "" });
      return;
    case "edit-viewed":
      if (viewingRecord && selectedPatient) {
        await openEditorWithRecord(
          viewingRecord,
          viewingFile ?? undefined,
          selectedPatient.id,
        );
      }
      return;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

async function showSignInLanding(): Promise<void> {
  app.innerHTML = `
    <main class="screen landing">
      <h1>Coaching Session Records</h1>
      <p>Sign in with Google to save session notes to your Drive.</p>
      <button type="button" class="btn primary" id="sign-in-btn">Sign in with Google</button>
      <p id="sign-in-error" class="status status-error" hidden></p>
    </main>
  `;
  document.getElementById("sign-in-btn")!.addEventListener("click", () => {
    void signIn()
      .then(() => enterSignedInFlow())
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Sign-in failed.";
        const errEl = document.getElementById("sign-in-error");
        if (errEl) {
          errEl.textContent = msg;
          errEl.hidden = false;
        }
      });
  });
}

async function enterSignedInFlow(): Promise<void> {
  try {
    if (isSignedIn()) {
      await ensureAccessToken(false).catch(() => signOut());
    }
  } catch {
    /* ignore */
  }

  if (!isSignedIn()) {
    await showSignInLanding();
    return;
  }

  if (!settings?.driveFolderId) {
    folderNameInput = DEFAULT_BACKUP_FOLDER;
    screen = "setup";
  } else {
    screen = "home";
  }

  render();
  if (settings?.driveFolderId && screen !== "setup") {
    void loadSidebarClients();
  }
}

export async function initApp(): Promise<void> {
  if (!hasGoogleConfig()) {
    renderMissingConfig();
    return;
  }

  if (!isSignedIn()) {
    await showSignInLanding();
    return;
  }

  await enterSignedInFlow();
}
