import type { FileShareLink, FileShareProvider, TelegramShareCreds, WebDavConfig } from "@/domain/types";
import { toBase64Url } from "../invites";
import { fetchPinnedDoc, publishDoc } from "./telegramSync";
import { validateSharedGroupDoc, type SharedGroupDoc } from "./types";
import { WEBDAV_DIR, webdavGet, webdavPut } from "./webdav";

/**
 * HTTP verso Google Drive / OneDrive / WebDAV / Telegram per i documenti di gruppo condivisi via file.
 *
 * Modulo Node-safe (solo fetch): nessun import dello store né di moduli Expo,
 * così le funzioni sono testabili con vitest mockando `fetch`.
 *
 * Lettura ANONIMA per Drive/OneDrive: chi si unisce a un gruppo non deve avere
 * un account cloud — il download usa URL pubblici. WebDAV invece richiede le
 * credenziali del server, che viaggiano nel link di invito (FileShareLink.webdav).
 * Telegram richiede bot token + chat id, che viaggiano nel link (FileShareLink.telegram):
 * il documento è il messaggio pinnato della chat (client in telegramSync.ts).
 * La scrittura richiede sempre credenziali valide (token OAuth, Basic auth o bot token).
 */

/** Timeout delle letture anonime: oltre i 10s si considera la rete irraggiungibile. */
export const DOWNLOAD_TIMEOUT_MS = 10_000;

/** Nome del file condiviso di un gruppo (uguale su tutti i provider). */
export function sharedFileName(groupId: string): string {
  return `splitfree_group_${groupId}.json`;
}

/** Percorso WebDAV predefinito del file condiviso di un gruppo. */
export function webdavSharedPath(groupId: string): string {
  return `${WEBDAV_DIR}/${sharedFileName(groupId)}`;
}

// ---------------------------------------------------------------------------
// Builder di URL (puri, esportati per i test)
// ---------------------------------------------------------------------------

/** URL pubblico di download diretto di un file Google Drive (nessun token richiesto). */
export function driveDownloadUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
}

/** URL di upload Drive: PATCH media se il file esiste, altrimenti multipart create. */
export function driveUploadUrl(fileId: string | null): string {
  return fileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`
    : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
}

/** URL di upload OneDrive: PUT del contenuto a percorso fisso nella cartella /SplitFree. */
export function oneDriveUploadUrl(groupId: string): string {
  return `https://graph.microsoft.com/v1.0/me/drive/root:/SplitFree/${sharedFileName(groupId)}:/content`;
}

/**
 * URL di download anonimo via OneDrive shares API:
 * base64url dello shareUrl (senza padding) con prefisso "u!".
 */
export function oneDriveShareDownloadUrl(shareUrl: string): string {
  return `https://api.onedrive.com/v1.0/shares/u!${toBase64Url(shareUrl)}/driveItem/content`;
}

// ---------------------------------------------------------------------------
// Scrittura (richiede access token)
// ---------------------------------------------------------------------------

/**
 * Carica il documento condiviso sul provider.
 * Drive: se `link.fileId` è noto sovrascrive con PATCH media, altrimenti crea
 * il file (multipart, come il backup manuale) e ritorna il nuovo fileId.
 * OneDrive: PUT a percorso fisso; il fileId arriva dal campo `id` della risposta.
 * WebDAV: PUT al percorso in `link.fileId` (o quello predefinito del gruppo);
 * `accessToken` è ignorato, le credenziali sono `link.webdav`.
 * Telegram: pubblica un nuovo documento pinnato; `accessToken` è ignorato, le
 * credenziali sono `link.telegram`. Il fileId resta la chat id e il ritorno
 * porta anche il `messageId` del nuovo messaggio pinnato (da salvare nel link).
 */
export async function uploadSharedDoc(
  provider: FileShareProvider,
  accessToken: string,
  link: { fileId: string; webdav?: WebDavConfig; telegram?: TelegramShareCreds } | null,
  doc: SharedGroupDoc,
): Promise<{ fileId: string; messageId?: number }> {
  const jsonContent = JSON.stringify(doc, null, 2);

  if (provider === "telegram") {
    const creds = link?.telegram;
    if (!creds || !creds.botToken || !creds.chatId) {
      throw new Error("Credenziali Telegram mancanti: chiedi all'amministratore un nuovo invito.");
    }
    const messageId = await publishDoc(creds, doc);
    return { fileId: creds.chatId, messageId };
  }

  if (provider === "webdav") {
    const cfg = link?.webdav;
    if (!cfg) {
      throw new Error("Credenziali WebDAV mancanti: chiedi all'amministratore un nuovo invito.");
    }
    const path = link.fileId || webdavSharedPath(doc.groupId);
    await webdavPut(cfg, path, jsonContent);
    return { fileId: path };
  }

  if (provider === "gdrive") {
    if (link?.fileId) {
      const res = await fetch(driveUploadUrl(link.fileId), {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: jsonContent,
      });
      if (!res.ok) {
        throw new Error(`Errore durante il salvataggio su Google Drive: ${res.status}`);
      }
      return { fileId: link.fileId };
    }

    // Crea il file con metadata + contenuto (multipart), imitando googleDriveSync.
    const boundary = "-------314159265358979323846";
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadata = {
      name: sharedFileName(doc.groupId),
      mimeType: "application/json",
      description: "Gruppo condiviso di SplitFree",
    };

    const multipartRequestBody =
      delimiter +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      JSON.stringify(metadata) +
      delimiter +
      "Content-Type: application/json\r\n\r\n" +
      jsonContent +
      closeDelimiter;

    const res = await fetch(driveUploadUrl(null), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: multipartRequestBody,
    });
    const body = await res.json().catch(() => ({} as Record<string, unknown>));
    if (!res.ok || typeof body.id !== "string") {
      throw new Error(`Errore durante il salvataggio su Google Drive: ${res.status}`);
    }
    return { fileId: body.id };
  }

  const res = await fetch(oneDriveUploadUrl(doc.groupId), {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: jsonContent,
  });
  const body = await res.json().catch(() => ({} as Record<string, unknown>));
  if (!res.ok || typeof body.id !== "string") {
    throw new Error(`Errore durante il salvataggio su OneDrive: ${res.status}`);
  }
  return { fileId: body.id };
}

/**
 * Rende il file accessibile a chiunque abbia il link.
 * Drive: permesso "anyone writer" (basta il fileId per leggere, shareUrl null).
 * OneDrive: link anonimo di modifica, ritorna `link.webUrl`.
 * WebDAV/Telegram: nessuna operazione — l'accesso è dato dalle credenziali nel link di invito.
 */
export async function makeShared(
  provider: FileShareProvider,
  accessToken: string,
  fileId: string,
): Promise<{ shareUrl: string | null }> {
  if (provider === "webdav" || provider === "telegram") {
    return { shareUrl: null };
  }

  if (provider === "gdrive") {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ role: "writer", type: "anyone" }),
    });
    if (!res.ok) {
      throw new Error(`Impossibile rendere pubblico il file su Google Drive: ${res.status}`);
    }
    return { shareUrl: null };
  }

  const res = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/createLink`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type: "edit", scope: "anonymous" }),
  });
  const body = await res.json().catch(() => ({} as Record<string, unknown>));
  const link = body.link as Record<string, unknown> | undefined;
  if (!res.ok || typeof link?.webUrl !== "string") {
    throw new Error(`Impossibile creare il link di condivisione OneDrive: ${res.status}`);
  }
  return { shareUrl: link.webUrl };
}

// ---------------------------------------------------------------------------
// Lettura anonima (nessun token: serve a chi riceve l'invito)
// ---------------------------------------------------------------------------

/**
 * Scarica e valida il documento condiviso.
 * Drive/OneDrive: lettura anonima via URL pubblici. WebDAV: GET autenticata
 * con le credenziali del link (`link.webdav`), portate dall'invito.
 * Telegram: documento pinnato della chat, letto via Bot API con le credenziali
 * del link (`link.telegram`).
 * 404 → file eliminato dall'amministratore; altri errori HTTP → messaggio chiaro.
 */
export async function downloadSharedDoc(
  provider: FileShareProvider,
  link: FileShareLink,
): Promise<SharedGroupDoc> {
  if (provider === "telegram") {
    const creds = link.telegram;
    if (!creds || !creds.botToken || !creds.chatId) {
      throw new Error("Credenziali Telegram mancanti: chiedi all'amministratore un nuovo invito.");
    }
    const pinned = await fetchPinnedDoc(creds);
    if (!pinned) {
      throw new Error("Nessun documento del gruppo pinnato nella chat Telegram: chiedi all'amministratore di ricondividere il gruppo.");
    }
    return pinned.doc;
  }

  if (provider === "webdav") {
    if (!link.webdav) {
      throw new Error("Credenziali WebDAV mancanti: chiedi all'amministratore un nuovo invito.");
    }
    const file = await webdavGet(link.webdav, link.fileId);
    if (!file) {
      throw new Error("Il file del gruppo è stato eliminato dall'amministratore.");
    }
    let raw: unknown;
    try {
      raw = JSON.parse(file.text);
    } catch {
      throw new Error("Il file scaricato non è un documento di gruppo SplitFree valido.");
    }
    const doc = validateSharedGroupDoc(raw);
    if (!doc) {
      throw new Error("Il file scaricato non è un documento di gruppo SplitFree valido.");
    }
    return doc;
  }

  const label = provider === "gdrive" ? "Google Drive" : "OneDrive";
  let url: string;
  if (provider === "gdrive") {
    url = driveDownloadUrl(link.fileId);
  } else {
    if (!link.shareUrl) {
      throw new Error("Il link di condivisione OneDrive manca: chiedi all'amministratore un nuovo invito.");
    }
    url = oneDriveShareDownloadUrl(link.shareUrl);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, { signal: controller.signal });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    throw new Error(
      aborted
        ? `Il file del gruppo non risponde (timeout): controlla la connessione e riprova.`
        : `Impossibile raggiungere ${label}: controlla la connessione e riprova.`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 404) {
    throw new Error("Il file del gruppo è stato eliminato dall'amministratore.");
  }
  if (!res.ok) {
    throw new Error(`Impossibile scaricare il file del gruppo da ${label} (HTTP ${res.status}).`);
  }
  const raw = await res.json().catch(() => null);
  const doc = validateSharedGroupDoc(raw);
  if (!doc) {
    throw new Error("Il file scaricato non è un documento di gruppo SplitFree valido.");
  }
  return doc;
}
