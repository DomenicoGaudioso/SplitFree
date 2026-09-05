import type { TelegramShareCreds } from "@/domain/types";
import { validateSharedGroupDoc, type SharedGroupDoc } from "./types";

/**
 * Telegram come storage del file condiviso (provider consigliato): il documento
 * JSON del gruppo è un DOCUMENTO PINNATO in un gruppo Telegram, letto e scritto
 * via Bot API con il solo bot token — niente registrazioni, niente OAuth.
 *
 * - Lettura: getChat → pinned_message → (se ha un document) getFile → download
 *   da https://api.telegram.org/file/bot<TOKEN>/<file_path> → JSON validato.
 * - Scrittura: sendDocument con il JSON come file, poi pinChatMessage sul nuovo
 *   messaggio (notifica silenziosa). Le vecchie versioni restano nella chat
 *   come storico: è una feature, non un rifiuto.
 * - Verifica token: getMe.
 *
 * Corsa fra dispositivi: il ciclo pull → merge → push di sync.ts basta; se due
 * membri pubblicano insieme, vince l'ultimo pin. È un limite noto e accettato
 * (lo stesso merge last-write-wins degli altri provider via file).
 *
 * Modulo Node-safe (solo fetch): nessun import dello store né di moduli Expo,
 * così le funzioni sono testabili con vitest mockando `fetch`.
 * Il tipo TelegramShareCreds vive in src/domain/types.ts per evitare cicli.
 */

export type { TelegramShareCreds };

/** Timeout delle chiamate alla Bot API: oltre i 10s si considera la rete irraggiungibile. */
export const TG_TIMEOUT_MS = 10_000;

/** Nome del documento allegato al messaggio pinnato. */
export const TG_DOC_FILENAME = "splitfree_group.json";

// ---------------------------------------------------------------------------
// Helper puri (esportati per i test)
// ---------------------------------------------------------------------------

/** URL di un metodo della Bot API. */
export function tgApiUrl(botToken: string, method: string): string {
  return `https://api.telegram.org/bot${botToken}/${method}`;
}

/** URL di download di un file, dato il file_path restituito da getFile. */
export function tgFileDownloadUrl(botToken: string, filePath: string): string {
  return `https://api.telegram.org/file/bot${botToken}/${filePath}`;
}

/** Caption del documento pubblicato: la revisione rende riconoscibile la versione nella chat. */
export function docCaption(doc: SharedGroupDoc): string {
  return `SplitFree · revisione ${doc.revision}`;
}

/**
 * Estrae dal `result` di getChat il documento pinnato, se c'è:
 * ritorna { fileId, messageId } oppure null se non c'è pinned o il pinned non ha un document.
 */
export function parsePinnedDocument(getChatResult: unknown): { fileId: string; messageId: number } | null {
  if (typeof getChatResult !== "object" || getChatResult === null) return null;
  const pinned = (getChatResult as { pinned_message?: unknown }).pinned_message;
  if (typeof pinned !== "object" || pinned === null) return null;
  const messageId = (pinned as { message_id?: unknown }).message_id;
  const document = (pinned as { document?: unknown }).document;
  if (typeof messageId !== "number" || !Number.isFinite(messageId)) return null;
  if (typeof document !== "object" || document === null) return null;
  const fileId = (document as { file_id?: unknown }).file_id;
  if (typeof fileId !== "string" || !fileId) return null;
  return { fileId, messageId };
}

/** Corpo multipart/form-data di sendDocument: chat_id, caption e il file JSON. */
export function buildSendDocumentBody(params: {
  boundary: string;
  chatId: string;
  caption: string;
  fileName: string;
  json: string;
}): string {
  const { boundary, chatId, caption, fileName, json } = params;
  return (
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n` +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n` +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="document"; filename="${fileName}"\r\n` +
    `Content-Type: application/json\r\n\r\n${json}\r\n` +
    `--${boundary}--`
  );
}

// ---------------------------------------------------------------------------
// Wizard: scoperta del gruppo Telegram (getUpdates long polling)
// ---------------------------------------------------------------------------

/** Deep link Telegram che apre il selettore "aggiungi a un gruppo" del bot. */
export function startGroupUrl(botUsername: string): string {
  return `https://t.me/${botUsername}?startgroup=1`;
}

type TgChat = { id: number; type?: string; title?: string };

function isGroupChat(chat: TgChat | undefined): chat is TgChat {
  return !!chat && typeof chat.id === "number" && (chat.type === "group" || chat.type === "supergroup");
}

/**
 * Estrae dagli update di getUpdates le chat di gruppo in cui il bot è entrato:
 * - message con `group_chat_created` / `supergroup_chat_created` / `new_chat_members`;
 * - `my_chat_member` con new_chat_member.status member/administrator.
 * Salta le chat private e quelle in `excludeIds`. Ritorna coppie { chatId, title }
 * (chatId come stringa, negativa per i gruppi), deduplicate, nell'ordine degli update.
 */
export function extractGroupChats(updates: unknown, excludeIds: string[] = []): { chatId: string; title: string }[] {
  if (!Array.isArray(updates)) return [];
  const out: { chatId: string; title: string }[] = [];
  const seen = new Set<string>(excludeIds);

  const push = (chat: TgChat | undefined) => {
    if (!isGroupChat(chat)) return;
    const chatId = String(chat.id);
    if (seen.has(chatId)) return;
    seen.add(chatId);
    out.push({ chatId, title: typeof chat.title === "string" && chat.title ? chat.title : "Gruppo Telegram" });
  };

  for (const u of updates) {
    if (typeof u !== "object" || u === null) continue;
    const update = u as {
      message?: { chat?: TgChat; new_chat_members?: unknown; group_chat_created?: unknown; supergroup_chat_created?: unknown };
      my_chat_member?: { chat?: TgChat; new_chat_member?: { status?: string } };
    };
    const msg = update.message;
    if (msg && (msg.group_chat_created || msg.supergroup_chat_created || Array.isArray(msg.new_chat_members))) {
      push(msg.chat);
    }
    const mcm = update.my_chat_member;
    if (mcm && (mcm.new_chat_member?.status === "member" || mcm.new_chat_member?.status === "administrator")) {
      push(mcm.chat);
    }
  }
  return out;
}

/** L'update_id più alto nella lista: il prossimo poll riparte da max+1. */
export function maxUpdateId(updates: unknown): number | null {
  if (!Array.isArray(updates)) return null;
  let max: number | null = null;
  for (const u of updates) {
    const id = (u as { update_id?: unknown })?.update_id;
    if (typeof id === "number" && Number.isFinite(id) && (max === null || id > max)) max = id;
  }
  return max;
}

// ---------------------------------------------------------------------------
// Errori e rete
// ---------------------------------------------------------------------------

/** Messaggi italiani per gli errori della Bot API: mai stack tecnici. */
function tgHttpError(status: number): string {
  if (status === 401) return "Token del bot non valido.";
  if (status === 400 || status === 403) {
    return "Il bot non è nel gruppo Telegram o la chat ID è errata.";
  }
  return `Errore di Telegram (HTTP ${status}): riprova più tardi.`;
}

/** fetch con timeout di 10s e errori tradotti in italiano. */
async function tgFetch(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TG_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) throw new Error(tgHttpError(res.status));
    return res;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Telegram non risponde (timeout): controlla la connessione e riprova.");
    }
    if (err instanceof TypeError) {
      // Errore di rete (fetch fallita prima di una risposta HTTP).
      throw new Error("Impossibile raggiungere Telegram: controlla la connessione e riprova.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Parsa il corpo { ok, result } della Bot API; lancia se ok è false. */
async function tgResult(res: Response): Promise<unknown> {
  const body = (await res.json().catch(() => null)) as { ok?: boolean; result?: unknown } | null;
  if (!body?.ok) throw new Error("Risposta di Telegram non valida: riprova più tardi.");
  return body.result;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/** Verifica il bot token con getMe; ritorna l'username del bot. Lancia con errore italiano. */
export async function tgGetMe(botToken: string): Promise<string> {
  const res = await tgFetch(tgApiUrl(botToken, "getMe"));
  const result = (await tgResult(res)) as { username?: unknown };
  return typeof result.username === "string" ? result.username : "bot";
}

/**
 * Scarica il documento condiviso dal messaggio pinnato della chat.
 * Ritorna null se non c'è nessun pinned o il pinned non ha un document:
 * il gruppo non è stato ancora pubblicato su quella chat.
 */
export async function fetchPinnedDoc(
  creds: TelegramShareCreds,
): Promise<{ doc: SharedGroupDoc; messageId: number } | null> {
  const chatRes = await tgFetch(tgApiUrl(creds.botToken, "getChat"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: creds.chatId }),
  });
  const pinned = parsePinnedDocument(await tgResult(chatRes));
  if (!pinned) return null;

  const fileRes = await tgFetch(tgApiUrl(creds.botToken, "getFile"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id: pinned.fileId }),
  });
  const fileResult = (await tgResult(fileRes)) as { file_path?: unknown };
  if (typeof fileResult.file_path !== "string" || !fileResult.file_path) {
    throw new Error("Impossibile leggere il documento del gruppo pinnato su Telegram.");
  }

  const docRes = await tgFetch(tgFileDownloadUrl(creds.botToken, fileResult.file_path));
  const raw = await docRes.json().catch(() => null);
  const doc = validateSharedGroupDoc(raw);
  if (!doc) {
    throw new Error("Il documento pinnato non è un documento di gruppo SplitFree valido.");
  }
  return { doc, messageId: pinned.messageId };
}

/**
 * Pubblica una nuova versione del documento: sendDocument + pinChatMessage
 * (silenzioso) sul messaggio appena inviato. Ritorna il nuovo messageId.
 * Le versioni precedenti restano nella chat come storico.
 */
export async function publishDoc(creds: TelegramShareCreds, doc: SharedGroupDoc): Promise<number> {
  const boundary = "----splitfree-telegram-boundary";
  const res = await tgFetch(tgApiUrl(creds.botToken, "sendDocument"), {
    method: "POST",
    headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
    body: buildSendDocumentBody({
      boundary,
      chatId: creds.chatId,
      caption: docCaption(doc),
      fileName: TG_DOC_FILENAME,
      json: JSON.stringify(doc, null, 2),
    }),
  });
  const result = (await tgResult(res)) as { message_id?: unknown };
  if (typeof result.message_id !== "number") {
    throw new Error("Risposta di Telegram non valida: riprova più tardi.");
  }
  const messageId = result.message_id;

  // Il pin deve riuscire, altrimenti i lettori continuerebbero a vedere la versione vecchia.
  await tgFetch(tgApiUrl(creds.botToken, "pinChatMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: creds.chatId, message_id: messageId, disable_notification: true }),
  });
  return messageId;
}

/** Username del bot (senza @), dal getMe: serve per il deep link startgroup del wizard. */
export async function getBotUsername(botToken: string): Promise<string> {
  return tgGetMe(botToken);
}

/** Cache semplice token → username: evita un getMe a ogni apertura delle Impostazioni. */
const botUsernameCache = new Map<string, string>();

/** Come getBotUsername ma con cache in memoria (solo i successi sono cached). */
export async function getCachedBotUsername(botToken: string): Promise<string> {
  const cached = botUsernameCache.get(botToken);
  if (cached) return cached;
  const username = await tgGetMe(botToken);
  botUsernameCache.set(botToken, username);
  return username;
}

/** Crea un link di invito Telegram alla chat (per far entrare i partecipanti). */
export async function createGroupInviteLink(botToken: string, chatId: string): Promise<string> {
  const res = await tgFetch(tgApiUrl(botToken, "createChatInviteLink"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId }),
  });
  const result = (await tgResult(res)) as { invite_link?: unknown };
  if (typeof result.invite_link !== "string" || !result.invite_link) {
    throw new Error("Risposta di Telegram non valida: riprova più tardi.");
  }
  return result.invite_link;
}

/** Quanto Telegram tiene aperta ogni chiamata getUpdates (long polling). */
export const TG_POLL_TIMEOUT_S = 5;

/** Timeout predefinito dell'attesa del gruppo nel wizard: 2 minuti. */
export const WAIT_GROUP_TIMEOUT_MS = 120_000;

/**
 * Attende che il bot venga aggiunto a un nuovo gruppo Telegram (wizard di
 * condivisione): long polling su getUpdates con offset crescente finché non
 * compare una chat di gruppo nuova (vedi extractGroupChats) o scade il tempo.
 * `excludeChatIds` salta chat già note (es. quella di un gruppo già condiviso).
 * Annullabile via `signal`. Errori sempre in italiano.
 */
export async function waitForNewGroupChat(
  botToken: string,
  opts?: { timeoutMs?: number; excludeChatIds?: string[]; signal?: AbortSignal },
): Promise<{ chatId: string; title: string }> {
  const timeoutMs = opts?.timeoutMs ?? WAIT_GROUP_TIMEOUT_MS;
  const exclude = opts?.excludeChatIds ?? [];
  const deadline = Date.now() + timeoutMs;
  let offset: number | undefined;

  for (;;) {
    if (opts?.signal?.aborted) {
      throw new Error("Attesa annullata.");
    }
    const res = await tgFetch(tgApiUrl(botToken, "getUpdates"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        timeout: TG_POLL_TIMEOUT_S,
        ...(offset !== undefined ? { offset } : {}),
        allowed_updates: ["message", "my_chat_member"],
      }),
    });
    const updates = await tgResult(res);
    const found = extractGroupChats(updates, exclude);
    if (found.length > 0) return found[0];
    const max = maxUpdateId(updates);
    if (max !== null) offset = max + 1;
    if (Date.now() >= deadline) {
      throw new Error("Non ho visto il gruppo: assicurati di aver aggiunto il bot e riprova.");
    }
  }
}
