import { useSyncExternalStore } from "react";
import type { Expense, FileShareLink, FileShareProvider, Group, Person, Settlement, TelegramShareCreds, WebDavConfig } from "@/domain/types";
import { getValidAccessToken, getWebdavConfig } from "../cloudTokens";
import { buildDoc } from "./doc";
import { mergeDocs } from "./merge";
import { downloadSharedDoc, uploadSharedDoc } from "./providers";
import type { SharedGroupDoc } from "./types";

/**
 * Sincronizzazione di un gruppo condiviso via file: lo store locale resta la
 * cache offline, il file JSON sul cloud dell'amministratore è la sorgente condivisa.
 *
 * - pull: scarica il documento, lo fonde con lo stato locale (mergeDocs) e lo applica;
 * - push: richiede credenziali valide (token OAuth per Drive/OneDrive, credenziali
 *   WebDAV o bot token Telegram dal link di invito o dalle Impostazioni); senza → readOnly
 *   (per Telegram non capita: il token viaggia sempre nel link);
 *   fonde col remoto e carica il risultato (un retry su conflitto HTTP 409/412);
 * - debounce di 3s per gruppo sul push, così raffiche di editing producono
 *   una sola scrittura remota.
 *
 * Modulo Node-safe: lo store arriva via dynamic import solo nei percorsi reali,
 * le dipendenze sono iniettabili nei test (pattern di dataSync.ts).
 * Nessuna funzione lancia eccezioni: gli errori tornano nel risultato.
 */

export type SyncResult = { ok: boolean; error?: string; readOnly?: boolean };

/** Debounce del push dopo ogni modifica locale. */
export const PUSH_DEBOUNCE_MS = 3000;

// ---------------------------------------------------------------------------
// Stato dell'ultima sync per gruppo (banner "sola lettura" / errori in UI)
// ---------------------------------------------------------------------------

export type FileShareSyncStatus = {
  /** L'ultimo push è fallito perché l'account del provider non è collegato/scaduto. */
  readOnly: boolean;
  /** Messaggio dell'ultimo errore (pull o push), null se l'ultima sync è andata bene. */
  error: string | null;
};

const syncStatuses = new Map<string, FileShareSyncStatus>();
const statusListeners = new Set<() => void>();

function setSyncStatus(groupId: string, status: FileShareSyncStatus): void {
  syncStatuses.set(groupId, status);
  for (const listener of statusListeners) listener();
}

/** Ultimo stato di sync noto per il gruppo (null se mai sincronizzato). */
export function getLastSyncError(groupId: string): FileShareSyncStatus | null {
  return syncStatuses.get(groupId) ?? null;
}

export function subscribeFileShareSync(listener: () => void): () => void {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

/** Hook React: riesegue il render quando cambia lo stato di sync del gruppo. */
export function useFileShareSyncStatus(groupId: string | undefined): FileShareSyncStatus | null {
  return useSyncExternalStore(subscribeFileShareSync, () =>
    groupId ? getLastSyncError(groupId) : null,
  );
}

// ---------------------------------------------------------------------------
// Dipendenze iniettabili
// ---------------------------------------------------------------------------

export type GroupSlices = {
  people: Person[];
  expenses: Expense[];
  settlements: Settlement[];
};

export type FileShareSyncDeps = {
  getGroup: (groupId: string) => Group | undefined;
  getSlices: (groupId: string) => GroupSlices;
  applyDoc: (groupId: string, doc: SharedGroupDoc) => void;
  /** Per WebDAV/Telegram il link serve a risolvere le credenziali (link.webdav/link.telegram o Impostazioni). */
  getToken: (provider: FileShareProvider, link?: FileShareLink) => Promise<string>;
  download: (provider: FileShareProvider, link: FileShareLink) => Promise<SharedGroupDoc>;
  upload: (
    provider: FileShareProvider,
    token: string,
    link: { fileId: string; webdav?: WebDavConfig; telegram?: TelegramShareCreds } | null,
    doc: SharedGroupDoc,
  ) => Promise<{ fileId: string; messageId?: number }>;
  /**
   * Solo Telegram: dopo un push riuscito salva nel fileShare del gruppo il
   * messageId del nuovo documento pinnato (ogni pubblicazione è un messaggio nuovo).
   */
  updateTelegramMessageId?: (groupId: string, messageId: number) => void;
};

async function defaultDeps(): Promise<FileShareSyncDeps> {
  const { useStore } = await import("@/store/store");
  return {
    getGroup: (groupId) => useStore.getState().data.groups.find((g) => g.id === groupId),
    getSlices: (groupId) => {
      const d = useStore.getState().data;
      return {
        people: d.people,
        expenses: d.expenses.filter((e) => e.groupId === groupId),
        settlements: d.settlements.filter((s) => s.groupId === groupId),
      };
    },
    applyDoc: (groupId, doc) => useStore.getState().applySharedDoc(groupId, doc),
    getToken: async (provider, link) => {
      if (provider === "webdav") {
        // Credenziali dal link (membro che si è unito via invito) o dalle
        // Impostazioni (amministratore): nessuna scadenza token, quindi niente
        // readOnly finché le credenziali ci sono.
        if (link?.webdav) return "webdav";
        await getWebdavConfig(); // lancia se non collegato → readOnly
        return "webdav";
      }
      if (provider === "telegram") {
        // Come WebDAV: il bot token viaggia nel link di invito, quindi ogni
        // membro può scrivere subito e non c'è readOnly. Fallback sulle
        // Impostazioni per l'amministratore che condivide dal proprio bot.
        const creds = await resolveTelegramCreds(link);
        return creds.botToken;
      }
      return getValidAccessToken(provider);
    },
    download: async (provider, link) => {
      if (provider === "webdav" && !link.webdav) {
        const cfg = await getWebdavConfig();
        return downloadSharedDoc(provider, { ...link, webdav: cfg });
      }
      if (provider === "telegram" && !link.telegram) {
        const creds = await resolveTelegramCreds(link);
        return downloadSharedDoc(provider, { ...link, telegram: creds });
      }
      return downloadSharedDoc(provider, link);
    },
    upload: async (provider, token, link, doc) => {
      if (provider === "webdav" && link && !link.webdav) {
        const cfg = await getWebdavConfig();
        return uploadSharedDoc(provider, token, { ...link, webdav: cfg }, doc);
      }
      if (provider === "telegram" && link && !link.telegram) {
        const creds = await resolveTelegramCreds(null);
        return uploadSharedDoc(provider, token, { ...link, telegram: creds }, doc);
      }
      return uploadSharedDoc(provider, token, link, doc);
    },
    updateTelegramMessageId: (groupId, messageId) => {
      const state = useStore.getState();
      const g = state.data.groups.find((x) => x.id === groupId);
      if (!g?.fileShare?.telegram) return;
      state.upsertCloudGroupPointer({
        ...g,
        fileShare: { ...g.fileShare, telegram: { ...g.fileShare.telegram, messageId } },
      });
    },
  };
}

/**
 * Credenziali Telegram per un gruppo: dal link di invito (membro) oppure dalle
 * Impostazioni (amministratore, settings.telegram delle Notifiche Telegram).
 * Lancia se mancano: i chiamanti lo traducono in errore leggibile.
 */
async function resolveTelegramCreds(link?: FileShareLink | null): Promise<TelegramShareCreds> {
  if (link?.telegram?.botToken && link.telegram.chatId) return link.telegram;
  const { useStore } = await import("@/store/store");
  const telegram = useStore.getState().data.settings.telegram;
  if (telegram?.botToken.trim() && telegram.chatId.trim()) {
    return { botToken: telegram.botToken.trim(), chatId: telegram.chatId.trim(), messageId: null };
  }
  throw new Error("Configura il bot Telegram nelle Impostazioni → Notifiche Telegram.");
}

/** Documento locale del gruppo costruito dai dati correnti dello store. */
function buildLocalDoc(group: Group, slices: GroupSlices): SharedGroupDoc {
  return buildDoc(group, slices.people, slices.expenses, slices.settlements);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Errori HTTP di conflitto di versione (412 Precondition Failed, 409 Conflict): si riprova una volta. */
export function isHttpConflict(err: unknown): boolean {
  return /\b(409|412)\b/.test(errorMessage(err));
}

// ---------------------------------------------------------------------------
// Pull
// ---------------------------------------------------------------------------

/**
 * Scarica il documento remoto, lo fonde con lo stato locale e applica il risultato.
 * Non lancia: { ok: false, error } su qualsiasi fallimento.
 */
export async function pullSharedGroup(groupId: string, deps?: FileShareSyncDeps): Promise<SyncResult> {
  const d = deps ?? (await defaultDeps());
  const group = d.getGroup(groupId);
  const link = group?.fileShare;
  if (!group || !link) {
    return { ok: false, error: "Il gruppo non è condiviso via file." };
  }
  try {
    const remote = await d.download(link.provider, link);
    const merged = mergeDocs(buildLocalDoc(group, d.getSlices(groupId)), remote);
    d.applyDoc(groupId, merged);
    setSyncStatus(groupId, { readOnly: getLastSyncError(groupId)?.readOnly ?? false, error: null });
    return { ok: true };
  } catch (err) {
    const error = errorMessage(err);
    setSyncStatus(groupId, { readOnly: getLastSyncError(groupId)?.readOnly ?? false, error });
    return { ok: false, error };
  }
}

// ---------------------------------------------------------------------------
// Push
// ---------------------------------------------------------------------------

/** Esegue subito il push (senza debounce): merge col remoto, upload, applica il risultato. */
async function pushNow(groupId: string, deps: FileShareSyncDeps): Promise<SyncResult> {
  const group = deps.getGroup(groupId);
  const link = group?.fileShare;
  if (!group || !link) {
    return { ok: false, error: "Il gruppo non è condiviso via file." };
  }

  let token: string;
  try {
    token = await deps.getToken(link.provider, link);
  } catch (err) {
    // Senza credenziali valide il gruppo resta leggibile ma non scrivibile.
    const error = errorMessage(err);
    setSyncStatus(groupId, { readOnly: true, error });
    return { ok: false, readOnly: true, error };
  }

  try {
    // Ciclo pull → merge → upload: il remoto potrebbe essere cambiato da altri membri.
    let remote: SharedGroupDoc | null = null;
    try {
      remote = await deps.download(link.provider, link);
    } catch {
      // Offline o file irraggiungibile: si carica comunque lo stato locale.
    }
    let merged = remote ? mergeDocs(buildLocalDoc(group, deps.getSlices(groupId)), remote) : buildLocalDoc(group, deps.getSlices(groupId));

    const uploadLink = { fileId: link.fileId, webdav: link.webdav, telegram: link.telegram };
    // Telegram: ogni push è un nuovo messaggio pinnato, va salvato il nuovo messageId.
    let uploadedMessageId: number | undefined;
    try {
      uploadedMessageId = (await deps.upload(link.provider, token, uploadLink, merged)).messageId;
    } catch (err) {
      if (!isHttpConflict(err)) throw err;
      // Conflitto di versione: un solo retry rileggendo il remoto e rifondendo.
      const fresh = deps.getGroup(groupId);
      if (!fresh) throw err;
      const remote2 = await deps.download(link.provider, link);
      merged = mergeDocs(buildLocalDoc(fresh, deps.getSlices(groupId)), remote2);
      uploadedMessageId = (await deps.upload(link.provider, token, uploadLink, merged)).messageId;
    }

    deps.applyDoc(groupId, merged);
    if (link.provider === "telegram" && uploadedMessageId != null) {
      deps.updateTelegramMessageId?.(groupId, uploadedMessageId);
    }
    setSyncStatus(groupId, { readOnly: false, error: null });
    return { ok: true };
  } catch (err) {
    const error = errorMessage(err);
    setSyncStatus(groupId, { readOnly: false, error });
    return { ok: false, error };
  }
}

type PendingPush = {
  timer: ReturnType<typeof setTimeout>;
  resolves: ((r: SyncResult) => void)[];
};

const pendingPushes = new Map<string, PendingPush>();

/**
 * Push con debounce di 3s per gruppo (le chiamate ravvicinate si accorpano in
 * una sola scrittura remota). Passando `deps` (test) l'esecuzione è immediata.
 * Mai eccezioni: il risultato arriva sempre come SyncResult.
 */
export function pushSharedGroup(groupId: string, deps?: FileShareSyncDeps): Promise<SyncResult> {
  if (deps) return pushNow(groupId, deps).catch((err) => ({ ok: false, error: errorMessage(err) }));

  const existing = pendingPushes.get(groupId);
  if (existing) {
    clearTimeout(existing.timer);
    return new Promise<SyncResult>((resolve) => {
      existing.resolves.push(resolve);
      existing.timer = setTimeout(() => void runDebouncedPush(groupId), PUSH_DEBOUNCE_MS);
    });
  }
  return new Promise<SyncResult>((resolve) => {
    pendingPushes.set(groupId, {
      resolves: [resolve],
      timer: setTimeout(() => void runDebouncedPush(groupId), PUSH_DEBOUNCE_MS),
    });
  });
}

async function runDebouncedPush(groupId: string): Promise<void> {
  const pending = pendingPushes.get(groupId);
  pendingPushes.delete(groupId);
  let result: SyncResult;
  try {
    result = await pushNow(groupId, await defaultDeps());
  } catch (err) {
    result = { ok: false, error: errorMessage(err) };
  }
  for (const resolve of pending?.resolves ?? []) resolve(result);
}
