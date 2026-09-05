import type { AppData, Settings, FileShareProvider, WebDavConfig } from "@/domain/types";
import { cloudStorageKeyFor, getValidAccessToken, getWebdavConfig } from "./cloudTokens";
import { WEBDAV_DIR, webdavGet, webdavPut } from "./fileShare/webdav";

/**
 * Sincronizzazione dell'intero AppData sul cloud personale dell'utente
 * ("i tuoi dati nel tuo cloud"): i dati vivono nel file `splitfree_data.json`
 * su Google Drive / OneDrive / WebDAV, lo store locale è solo una cache offline.
 *
 * DISTINTO dal backup manuale (`splitfree_backup.json` in googleDriveSync /
 * oneDriveSync), che resta un salvataggio su richiesta dell'utente.
 *
 * Il modulo è volutamente Node-safe: nessun import statico dello store né di
 * moduli Expo, così la logica (scelta provider, pull-vs-upload) è testabile con
 * vitest iniettando le dipendenze. Lo store arriva via dynamic import solo nei
 * percorsi reali dell'app, evitando cicli di import con `src/store/store.ts`.
 *
 * NOTA WebDAV: non c'è un access token OAuth. Nel parametro `token` delle
 * funzioni pubbliche viaggia la WebDavConfig serializzata in JSON
 * (vedi webdavTokenFor / parseWebdavToken), così le firme restano uniformi.
 */

export const DATA_FILE_NAME = "splitfree_data.json";

const CLOUD_UPLOAD_DEBOUNCE_MS = 5000;

export type RemoteAppData = {
  data: AppData;
  /** ISO dell'ultima modifica remota (modifiedTime / lastModifiedDateTime). */
  modifiedTime: string;
};

// ---------------------------------------------------------------------------
// Google Drive
// ---------------------------------------------------------------------------

async function gdriveFindDataFile(accessToken: string): Promise<{ id: string; modifiedTime: string } | null> {
  const query = encodeURIComponent(`name = '${DATA_FILE_NAME}' and trashed = false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime)`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (Array.isArray(data.files) && data.files.length > 0) {
    const f = data.files[0];
    return { id: f.id, modifiedTime: f.modifiedTime ?? "" };
  }
  return null;
}

async function uploadAppDataToGoogleDrive(accessToken: string, appData: AppData): Promise<string> {
  const jsonContent = JSON.stringify(appData, null, 2);
  const existing = await gdriveFindDataFile(accessToken);

  if (existing) {
    const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=media`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: jsonContent,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`Errore durante la sincronizzazione su Google Drive: ${res.status}`);
    }
    return body.modifiedTime ?? new Date().toISOString();
  }

  // Crea il file con metadata + contenuto (multipart), come per il backup manuale.
  const boundary = "-------314159265358979323846";
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadata = {
    name: DATA_FILE_NAME,
    mimeType: "application/json",
    description: "Dati di SplitFree (sincronizzazione automatica)",
  };

  const multipartRequestBody =
    delimiter +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    JSON.stringify(metadata) +
    delimiter +
    "Content-Type: application/json\r\n\r\n" +
    jsonContent +
    closeDelimiter;

  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body: multipartRequestBody,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Errore durante la sincronizzazione su Google Drive: ${res.status}`);
  }
  return body.modifiedTime ?? new Date().toISOString();
}

async function downloadAppDataFromGoogleDrive(accessToken: string): Promise<RemoteAppData | null> {
  const file = await gdriveFindDataFile(accessToken);
  if (!file) return null;

  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Impossibile scaricare i dati da Google Drive (HTTP ${res.status}).`);
  }
  const rawJson = await res.json();
  return { data: rawJson as AppData, modifiedTime: file.modifiedTime || new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// OneDrive (approot, con fallback alla cartella /SplitFree nella root)
// ---------------------------------------------------------------------------

const ONEDRIVE_DATA_PATHS = [
  `https://graph.microsoft.com/v1.0/me/drive/special/approot:/${DATA_FILE_NAME}`,
  `https://graph.microsoft.com/v1.0/me/drive/root:/SplitFree/${DATA_FILE_NAME}`,
];

async function uploadAppDataToOneDrive(accessToken: string, appData: AppData): Promise<string> {
  const jsonContent = JSON.stringify(appData, null, 2);
  let lastStatus = 0;
  for (const base of ONEDRIVE_DATA_PATHS) {
    const res = await fetch(`${base}:/content`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: jsonContent,
    });
    if (res.ok) {
      const body = await res.json().catch(() => ({}));
      return body.lastModifiedDateTime ?? new Date().toISOString();
    }
    lastStatus = res.status;
  }
  throw new Error(`Errore durante la sincronizzazione su OneDrive: ${lastStatus}`);
}

async function downloadAppDataFromOneDrive(accessToken: string): Promise<RemoteAppData | null> {
  for (const base of ONEDRIVE_DATA_PATHS) {
    // Prima i metadata (lastModifiedDateTime), poi il contenuto.
    const metaRes = await fetch(base, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (metaRes.status === 404) continue;
    if (!metaRes.ok) {
      throw new Error(`Impossibile leggere i dati da OneDrive (HTTP ${metaRes.status}).`);
    }
    const meta = await metaRes.json().catch(() => ({}));
    const contentRes = await fetch(`${base}:/content`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (contentRes.status === 404) return null;
    if (!contentRes.ok) {
      throw new Error(`Impossibile scaricare i dati da OneDrive (HTTP ${contentRes.status}).`);
    }
    const rawJson = await contentRes.json();
    return {
      data: rawJson as AppData,
      modifiedTime: meta.lastModifiedDateTime ?? new Date().toISOString(),
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// WebDAV (pCloud, Koofr, Nextcloud…): Basic auth, file a percorso fisso
// ---------------------------------------------------------------------------

/** Percorso remoto del file dati sul server WebDAV. */
export const WEBDAV_DATA_PATH = `${WEBDAV_DIR}/${DATA_FILE_NAME}`;

/** Serializza le credenziali WebDAV nel parametro `token` delle API pubbliche. */
export function webdavTokenFor(cfg: WebDavConfig): string {
  return JSON.stringify(cfg);
}

function parseWebdavToken(token: string): WebDavConfig {
  try {
    const cfg = JSON.parse(token) as WebDavConfig;
    if (cfg && typeof cfg.url === "string" && typeof cfg.username === "string" && typeof cfg.password === "string") {
      return cfg;
    }
  } catch {
    // cade nel lancio sotto
  }
  throw new Error("Credenziali WebDAV mancanti o non valide: riconnetti il server dalle Impostazioni.");
}

async function uploadAppDataToWebdav(token: string, appData: AppData): Promise<string> {
  const cfg = parseWebdavToken(token);
  await webdavPut(cfg, WEBDAV_DATA_PATH, JSON.stringify(appData, null, 2));
  // Il PUT non restituisce una data affidabile su tutti i server: usa l'ora locale.
  return new Date().toISOString();
}

async function downloadAppDataFromWebdav(token: string): Promise<RemoteAppData | null> {
  const cfg = parseWebdavToken(token);
  const file = await webdavGet(cfg, WEBDAV_DATA_PATH);
  if (!file) return null;
  let rawJson: AppData;
  try {
    rawJson = JSON.parse(file.text) as AppData;
  } catch {
    throw new Error("Il file dei dati sul server WebDAV non è un JSON valido.");
  }
  return { data: rawJson, modifiedTime: file.modifiedTime };
}

// ---------------------------------------------------------------------------
// API pubblica
// ---------------------------------------------------------------------------

/**
 * Carica l'AppData sul file `splitfree_data.json` del provider; ritorna la modifiedTime remota.
 * Per "webdav" `token` è la WebDavConfig in JSON (webdavTokenFor).
 */
export function uploadAppData(provider: FileShareProvider, token: string, data: AppData): Promise<string> {
  if (provider === "webdav") return uploadAppDataToWebdav(token, data);
  return provider === "gdrive"
    ? uploadAppDataToGoogleDrive(token, data)
    : uploadAppDataToOneDrive(token, data);
}

/**
 * Scarica l'AppData remoto; ritorna null se il file non esiste ancora sul cloud (404).
 * Per "webdav" `token` è la WebDavConfig in JSON (webdavTokenFor).
 */
export function downloadAppData(provider: FileShareProvider, token: string): Promise<RemoteAppData | null> {
  if (provider === "webdav") return downloadAppDataFromWebdav(token);
  return provider === "gdrive"
    ? downloadAppDataFromGoogleDrive(token)
    : downloadAppDataFromOneDrive(token);
}

/**
 * Provider cloud attivo per la sincronizzazione dati: il primo servizio connesso
 * e utilizzabile, preferendo quello con la sincronizzazione più recente.
 * WebDAV è "usabile" appena connesso: le credenziali non scadono come i token OAuth.
 */
export function activeDataProvider(settings: Pick<Settings, "cloudStorage" | "webdav">): FileShareProvider | null {
  const cloud = settings.cloudStorage;
  const candidates: { provider: FileShareProvider; lastSync: string }[] = [];
  if (cloud?.googleDrive?.connected && cloud.googleDrive.accessToken) {
    candidates.push({ provider: "gdrive", lastSync: cloud.googleDrive.lastSync ?? "" });
  }
  if (cloud?.oneDrive?.connected && cloud.oneDrive.accessToken) {
    candidates.push({ provider: "onedrive", lastSync: cloud.oneDrive.lastSync ?? "" });
  }
  const webdav = settings.webdav;
  if (webdav?.connected && webdav.url && webdav.username && webdav.password) {
    candidates.push({ provider: "webdav", lastSync: webdav.lastSync ?? "" });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.lastSync.localeCompare(a.lastSync));
  return candidates[0].provider;
}

/** Il file remoto va scaricato se è più recente dell'ultima sync locale (o se non abbiamo mai sincronizzato). */
export function isRemoteNewer(remoteModifiedTime: string, lastSync?: string | null): boolean {
  if (!lastSync) return true;
  const remoteMs = Date.parse(remoteModifiedTime);
  const localMs = Date.parse(lastSync);
  if (Number.isNaN(remoteMs) || Number.isNaN(localMs)) return true;
  return remoteMs > localMs;
}

/** Dipendenze di pullAppDataIfNewer: iniettabili nei test, risolte sull'app reale di default. */
export type PullDeps = {
  getToken: (provider: FileShareProvider) => Promise<string>;
  download: (provider: FileShareProvider, token: string) => Promise<RemoteAppData | null>;
  upload: (provider: FileShareProvider, token: string, data: AppData) => Promise<string>;
  getData: () => AppData;
  replaceAllData: (data: AppData) => void;
  updateLastSync: (provider: FileShareProvider, iso: string) => void;
};

// Sopprime il trigger di upload mentre sostituiamo i dati col pull o aggiorniamo
// lastSync dopo un upload: altrimenti ogni sync riprogrammerebbe se stessa all'infinito.
let suppressTrigger = false;

function withSuppressedTrigger(fn: () => void) {
  suppressTrigger = true;
  try {
    fn();
  } finally {
    suppressTrigger = false;
  }
}

async function defaultPullDeps(): Promise<PullDeps> {
  const { useStore } = await import("@/store/store");
  return {
    getToken: async (provider) =>
      provider === "webdav" ? webdavTokenFor(await getWebdavConfig()) : getValidAccessToken(provider),
    download: downloadAppData,
    upload: uploadAppData,
    getData: () => useStore.getState().data,
    replaceAllData: (data) => withSuppressedTrigger(() => useStore.getState().replaceAllData(data)),
    updateLastSync: (provider, iso) =>
      withSuppressedTrigger(() =>
        provider === "webdav"
          ? useStore.getState().updateWebdavSettings({ lastSync: iso })
          : useStore.getState().updateCloudStorage(cloudStorageKeyFor(provider), { lastSync: iso })
      ),
  };
}

/**
 * All'avvio (o dopo la prima connessione): se il file remoto è più recente dei dati
 * locali lo scarica e sostituisce tutto; se il remoto non esiste ancora, carica i
 * dati correnti. Ritorna l'azione compiuta ("pulled" | "uploaded" | "skipped").
 */
export async function pullAppDataIfNewer(
  provider: FileShareProvider,
  deps?: PullDeps
): Promise<"pulled" | "uploaded" | "skipped"> {
  const d = deps ?? (await defaultPullDeps());
  const token = await d.getToken(provider);
  const remote = await d.download(provider, token);

  if (!remote) {
    const modifiedTime = await d.upload(provider, token, d.getData());
    d.updateLastSync(provider, modifiedTime);
    return "uploaded";
  }

  const local = d.getData();
  const lastSync =
    provider === "webdav"
      ? local.settings.webdav?.lastSync
      : local.settings.cloudStorage?.[cloudStorageKeyFor(provider)]?.lastSync;
  if (isRemoteNewer(remote.modifiedTime, lastSync)) {
    d.replaceAllData(remote.data);
    d.updateLastSync(provider, remote.modifiedTime);
    return "pulled";
  }
  return "skipped";
}

const uploadTimers: Partial<Record<FileShareProvider, ReturnType<typeof setTimeout>>> = {};

/**
 * Programma l'upload dell'AppData corrente sul cloud con debounce di 5s:
 * ogni modifica ai dati riparte da zero, così scariche di editing producono
 * una sola scrittura remota. Non lancia mai: gli errori finiscono in console.warn.
 */
export function scheduleCloudUpload(provider: FileShareProvider): void {
  const existing = uploadTimers[provider];
  if (existing) clearTimeout(existing);
  uploadTimers[provider] = setTimeout(() => {
    uploadTimers[provider] = undefined;
    void (async () => {
      try {
        const { useStore } = await import("@/store/store");
        const token =
          provider === "webdav" ? webdavTokenFor(await getWebdavConfig()) : await getValidAccessToken(provider);
        const data = useStore.getState().data;
        const modifiedTime = await uploadAppData(provider, token, data);
        withSuppressedTrigger(() =>
          provider === "webdav"
            ? useStore.getState().updateWebdavSettings({ lastSync: modifiedTime })
            : useStore.getState().updateCloudStorage(cloudStorageKeyFor(provider), { lastSync: modifiedTime })
        );
      } catch (err) {
        console.warn("Sincronizzazione automatica su cloud non riuscita", err);
      }
    })();
  }, CLOUD_UPLOAD_DEBOUNCE_MS);
}

/** Hook chiamato dallo store dopo ogni commit: avvia l'upload se c'è un provider attivo. */
export function cloudSyncOnCommit(data: AppData): void {
  if (suppressTrigger) return;
  const provider = activeDataProvider(data.settings);
  if (provider) scheduleCloudUpload(provider);
}

/** Hook chiamato dallo store durante hydrate(): pull iniziale se c'è un provider attivo. */
export async function cloudSyncPullOnStart(data: AppData): Promise<void> {
  const provider = activeDataProvider(data.settings);
  if (!provider) return;
  await pullAppDataIfNewer(provider);
}
