const DATABASE_NAME = "aoe-sim.dataview-replay-folder.v1";
const DATABASE_VERSION = 1;
const STORE_NAME = "replay-folder-selection.v1";
const ACTIVE_RECORD_ID = "active";

interface ReplayFolderRecord {
  readonly id: typeof ACTIVE_RECORD_ID;
  readonly directoryHandle: FileSystemDirectoryHandle;
  readonly selectedFileName: string | null;
  readonly updatedAt: number;
}

export interface PersistedReplayFolderSelection {
  readonly directoryHandle: FileSystemDirectoryHandle;
  readonly selectedFileName: string | null;
}

export async function readReplayFolderSelection(): Promise<PersistedReplayFolderSelection | null> {
  const db = await openReplayFolderDatabase();
  try {
    const record = await readActiveRecord(db);
    if (record === undefined) {
      return null;
    }
    return validatedRecord(record);
  } finally {
    db.close();
  }
}

export async function writeReplayFolderSelection(selection: PersistedReplayFolderSelection): Promise<void> {
  const db = await openReplayFolderDatabase();
  try {
    await writeActiveRecord(db, {
      id: ACTIVE_RECORD_ID,
      directoryHandle: selection.directoryHandle,
      selectedFileName: selection.selectedFileName,
      updatedAt: Date.now()
    });
  } finally {
    db.close();
  }
}

function openReplayFolderDatabase(): Promise<IDBDatabase> {
  if (!globalThis.indexedDB) {
    throw new Error("IndexedDB is unavailable, so this browser cannot remember a replay folder handle.");
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onblocked = () => {
      reject(new Error("Replay folder storage is blocked by another open AoE Sim tab."));
    };
    request.onerror = () => {
      reject(indexedDbError("Could not open replay folder storage", request.error));
    };
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}

function readActiveRecord(db: IDBDatabase): Promise<unknown | undefined> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    let result: unknown | undefined;
    const request = store.get(ACTIVE_RECORD_ID);
    request.onerror = () => {
      reject(indexedDbError("Could not read saved replay folder", request.error));
    };
    request.onsuccess = () => {
      result = request.result as unknown | undefined;
    };
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => {
      reject(indexedDbError("Could not finish reading saved replay folder", transaction.error));
    };
    transaction.onabort = () => {
      reject(indexedDbError("Reading saved replay folder was aborted", transaction.error));
    };
  });
}

function writeActiveRecord(db: IDBDatabase, record: ReplayFolderRecord): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(record);
    request.onerror = () => {
      reject(indexedDbError("Could not save replay folder handle", request.error));
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => {
      reject(indexedDbError("Could not finish saving replay folder handle", transaction.error));
    };
    transaction.onabort = () => {
      reject(indexedDbError("Saving replay folder handle was aborted", transaction.error));
    };
  });
}

function validatedRecord(record: unknown): PersistedReplayFolderSelection {
  if (!record || typeof record !== "object") {
    throw new Error("Saved replay folder record is malformed.");
  }
  const candidate = record as Partial<ReplayFolderRecord>;
  if (candidate.id !== ACTIVE_RECORD_ID) {
    throw new Error("Saved replay folder record has an unexpected key.");
  }
  if (!isDirectoryHandle(candidate.directoryHandle)) {
    throw new Error("Saved replay folder handle is unavailable or malformed.");
  }
  if (candidate.selectedFileName !== null && !isReplayBasename(candidate.selectedFileName)) {
    throw new Error("Saved replay filename is invalid.");
  }
  return {
    directoryHandle: candidate.directoryHandle,
    selectedFileName: candidate.selectedFileName
  };
}

function isDirectoryHandle(value: unknown): value is FileSystemDirectoryHandle {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as { readonly kind?: unknown }).kind === "directory" &&
      typeof (value as { readonly name?: unknown }).name === "string"
  );
}

function isReplayBasename(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= 255 &&
    !/[\\/]/.test(value) &&
    value.toLowerCase().endsWith(".aoe2record");
}

function indexedDbError(message: string, error: DOMException | null): Error {
  if (!error) {
    return new Error(message);
  }
  return new Error(`${message}: ${error.name}${error.message ? `: ${error.message}` : ""}`);
}
