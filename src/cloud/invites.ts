import type { FileShareProvider, FirebaseWebConfig, WebDavConfig } from "@/domain/types";

export type InvitePayload = {
  v: 1;
  code: string;
  groupId: string;
  groupName: string;
  emoji: string;
  currency: string;
  config: FirebaseWebConfig;
  googleClientId?: string;
  microsoftClientId?: string;
};

/**
 * Invito v2: gruppo condiviso via file JSON sul cloud dell'amministratore.
 * Auto-contenuto: basta fileId (+ shareUrl per OneDrive) per leggere il
 * documento, nessun progetto Firebase né account richiesti.
 *
 * Con provider "webdav" il payload porta anche le credenziali del server:
 * IL LINK DIVENTA UN SEGRETO — chi lo possiede può leggere e scrivere il file.
 * Si consiglia di usare una app-password dedicata (pCloud, Koofr, Nextcloud
 * la offrono) e di non inoltrare il link su canali pubblici.
 *
 * Con provider "telegram" il payload porta bot token + chat id del gruppo
 * Telegram che ospita il documento pinnato: anche qui IL LINK È IL SEGRETO
 * del gruppo. Il messageId non viaggia nell'invito: chi si unisce lo scopre
 * dal pinned message della chat.
 */
export type FileInvitePayload = {
  v: 2;
  provider: FileShareProvider;
  fileId: string;
  shareUrl: string | null;
  groupId: string;
  groupName: string;
  emoji: string;
  currency: string;
  ownerName: string;
  /** Solo per provider "webdav": credenziali del server che ospita il file. */
  webdav?: WebDavConfig;
  /** Solo per provider "telegram": bot token + chat id (il messageId si scopre dal pin). */
  telegram?: { botToken: string; chatId: string; tgInviteLink?: string };
};

/**
 * Codifica base64url di una stringa Unicode. `btoa`/`atob` sono globali sia
 * su web sia su React Native (polyfill incluso in react-native core) sia in
 * Node (usato nei test): operano su stringhe "binarie", quindi passiamo
 * dall'UTF-8 con l'idioma classico encodeURIComponent/unescape.
 */
export function toBase64Url(text: string): string {
  const binary = unescape(encodeURIComponent(text));
  const b64 = btoa(binary);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(encoded: string): string {
  const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (b64.length % 4)) % 4;
  const binary = atob(b64 + "=".repeat(padLen));
  return decodeURIComponent(escape(binary));
}

/**
 * Codice invito: breve, casuale, è il documento Firestore che le regole
 * verificano per far entrare un membro. Usa `crypto.getRandomValues`
 * (globale su web, React Native e Node) invece di expo-crypto per restare
 * importabile anche dai test, che girano in puro Node senza Metro.
 */
export function newInviteCode(): string {
  const bytes = new Uint8Array(8);
  const g = globalThis as { crypto?: Crypto };
  if (g.crypto?.getRandomValues) {
    g.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function encodeInvite(payload: InvitePayload | FileInvitePayload): string {
  return toBase64Url(JSON.stringify(payload));
}

/** Type guard: distingue un invito v2 (condivisione via file) da uno v1 (Firebase). */
export function isFileInvite(
  payload: InvitePayload | FileInvitePayload | null | undefined,
): payload is FileInvitePayload {
  return !!payload && (payload as { v?: number }).v === 2;
}

/** Parsing difensivo di un invito v2: null su qualsiasi campo mancante o difforme. */
function validateFileInvite(data: FileInvitePayload): FileInvitePayload | null {
  if (
    (data.provider !== "gdrive" &&
      data.provider !== "onedrive" &&
      data.provider !== "webdav" &&
      data.provider !== "telegram") ||
    !data.fileId ||
    typeof data.fileId !== "string" ||
    (data.shareUrl !== null && typeof data.shareUrl !== "string") ||
    !data.groupId ||
    typeof data.groupName !== "string" ||
    typeof data.emoji !== "string" ||
    typeof data.currency !== "string" ||
    typeof data.ownerName !== "string"
  ) {
    return null;
  }
  // WebDAV senza credenziali non è leggibile né scrivibile: invito inutilizzabile.
  if (data.provider === "webdav") {
    const w = data.webdav;
    if (!w || typeof w.url !== "string" || !w.url || typeof w.username !== "string" || !w.username || typeof w.password !== "string" || !w.password) {
      return null;
    }
  }
  // Telegram senza bot token/chat id non è raggiungibile: invito inutilizzabile.
  if (data.provider === "telegram") {
    const tg = data.telegram;
    if (!tg || typeof tg.botToken !== "string" || !tg.botToken || typeof tg.chatId !== "string" || !tg.chatId) {
      return null;
    }
    // Il link d'invito Telegram è opzionale, ma se c'è dev'essere una stringa.
    if (tg.tgInviteLink !== undefined && typeof tg.tgInviteLink !== "string") {
      return null;
    }
  }
  return data;
}

/** Estrae l'invito da un link "splitfree://join?i=..." o dal solo blocco incollato. */
export function decodeInvite(text: string): InvitePayload | FileInvitePayload | null {
  try {
    const trimmed = text.trim();
    const linkMatch = trimmed.match(/[?&]i=([A-Za-z0-9_-]+)/);
    const blob = linkMatch ? linkMatch[1] : trimmed;
    const json = fromBase64Url(blob);
    const data = JSON.parse(json) as Record<string, unknown> | null;
    if (!data) return null;
    if (data.v === 2) return validateFileInvite(data as unknown as FileInvitePayload);
    const v1 = data as unknown as InvitePayload;
    if (data.v !== 1 || !v1.code || !v1.groupId || !v1.config?.projectId || !v1.config?.apiKey) return null;
    return v1;
  } catch {
    return null;
  }
}

export function buildInviteLink(payload: InvitePayload | FileInvitePayload): string {
  return `splitfree://join?i=${encodeInvite(payload)}`;
}
