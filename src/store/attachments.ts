import { Platform } from "react-native";
import { Directory, File, Paths } from "expo-file-system";

/**
 * Archiviazione locale degli allegati (foto di ricevute, PDF).
 * - Nativo: copia nella cartella privata `attachments/<expenseId>/<id>.<ext>`;
 *   nel database resta solo il percorso relativo.
 * - Web/desktop: il file viene salvato come Blob in IndexedDB con chiave
 *   `<expenseId>/<id>`; l'URL di visualizzazione è un object URL temporaneo.
 */

export type SavedAttachment = {
  storageKey: string;
  sizeBytes: number;
};

const ATTACH_DIR = "attachments";

function extensionFor(fileName: string, mimeType: string): string {
  const fromName = fileName.includes(".") ? fileName.split(".").pop()!.toLowerCase() : "";
  if (fromName && fromName.length <= 5) return fromName;
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/heic") return "heic";
  if (mimeType === "application/pdf") return "pdf";
  return "bin";
}

export function isImageMime(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

export async function saveAttachment(params: {
  id: string;
  expenseId: string;
  sourceUri: string;
  fileName: string;
  mimeType: string;
}): Promise<SavedAttachment> {
  const ext = extensionFor(params.fileName, params.mimeType);
  if (Platform.OS === "web") {
    const response = await fetch(params.sourceUri);
    const blob = await response.blob();
    const key = `${params.expenseId}/${params.id}.${ext}`;
    await idbPut(key, blob);
    return { storageKey: key, sizeBytes: blob.size };
  }
  const dir = new Directory(Paths.document, ATTACH_DIR, params.expenseId);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const target = new File(dir, `${params.id}.${ext}`);
  const source = new File(params.sourceUri);
  await source.copy(target);
  const size = target.size ?? 0;
  return { storageKey: `${ATTACH_DIR}/${params.expenseId}/${params.id}.${ext}`, sizeBytes: size };
}

/** URI visualizzabile (file:// su nativo, blob: su web). */
export async function resolveAttachmentUri(storageKey: string): Promise<string | null> {
  if (Platform.OS === "web") {
    const blob = await idbGet(storageKey);
    if (!blob) return null;
    return URL.createObjectURL(blob);
  }
  const file = new File(Paths.document, storageKey);
  return file.exists ? file.uri : null;
}

export async function deleteAttachmentFile(storageKey: string): Promise<void> {
  try {
    if (Platform.OS === "web") {
      await idbDelete(storageKey);
      return;
    }
    const file = new File(Paths.document, storageKey);
    if (file.exists) file.delete();
  } catch (err) {
    console.warn("deleteAttachmentFile failed", err);
  }
}

export async function deleteExpenseAttachmentFiles(expenseId: string, keys: string[]): Promise<void> {
  for (const k of keys) await deleteAttachmentFile(k);
  if (Platform.OS !== "web") {
    try {
      const dir = new Directory(Paths.document, ATTACH_DIR, expenseId);
      if (dir.exists) dir.delete();
    } catch {
      // cartella già rimossa o non vuota: non bloccante
    }
  }
}

/** Condivisione / apertura: su nativo serve un URI di file, su web si scarica. */
export async function attachmentFileUri(storageKey: string): Promise<string | null> {
  return resolveAttachmentUri(storageKey);
}

// ---------------------------------------------------------------------------
// IndexedDB minimale (solo web)
// ---------------------------------------------------------------------------

const DB_NAME = "splitfree-attachments";
const STORE = "files";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const idb = (globalThis as unknown as { indexedDB?: IDBFactory }).indexedDB;
    if (!idb) {
      reject(new Error("IndexedDB non disponibile"));
      return;
    }
    const req = idb.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(key: string, blob: Blob): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(blob, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
  );
}

function idbGet(key: string): Promise<Blob | null> {
  return openDb().then(
    (db) =>
      new Promise<Blob | null>((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).get(key);
        req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
        req.onerror = () => reject(req.error);
      })
  );
}

function idbDelete(key: string): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
  );
}
