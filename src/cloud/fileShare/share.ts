import { Platform, Share } from "react-native";
import * as Clipboard from "expo-clipboard";
import type { Expense, FileShareLink, FileShareProvider, Group, Person, Settlement } from "@/domain/types";
import { getValidAccessToken, getWebdavConfig, providerLabel } from "../cloudTokens";
import { buildInviteLink, type FileInvitePayload } from "../invites";
import { buildDoc } from "./doc";
import { makeShared, uploadSharedDoc, webdavSharedPath } from "./providers";
import { publishDoc, tgGetMe } from "./telegramSync";

export type FileShareResult = {
  ok: boolean;
  link?: string;
  error?: string;
};

/**
 * Condivide un gruppo via file JSON sul cloud dell'amministratore
 * (Google Drive / OneDrive / WebDAV):
 * credenziali (token OAuth o Basic auth WebDAV) → upload del documento →
 * file reso accessibile → il gruppo locale viene collegato al file →
 * invito v2 → foglio nativo di condivisione (o clipboard su web), esattamente
 * come la condivisione "1 click".
 *
 * Con WebDAV le credenziali entrano nel link di invito: chi lo riceve può
 * subito leggere E scrivere, senza collegare un proprio account. Il link va
 * quindi trattato come un segreto.
 *
 * Mai eccezioni: ogni fallimento torna come { ok: false, error } in italiano.
 */
export async function shareGroupViaFile(params: {
  group: Group;
  people: Person[];
  expenses: Expense[];
  settlements: Settlement[];
  self: Person | null | undefined;
  provider: FileShareProvider;
  /** Chiamato col gruppo aggiornato (campo fileShare valorizzato), pattern di oneClickShare. */
  onLinked?: (updatedGroup: Group) => void;
  skipNativeShare?: boolean;
}): Promise<FileShareResult> {
  const { group, people, expenses, settlements, self, provider, onLinked, skipNativeShare } = params;
  const label = providerLabel(provider);

  try {
    let accessToken = "";
    let webdav: FileShareLink["webdav"];
    try {
      if (provider === "webdav") {
        webdav = await getWebdavConfig();
      } else {
        accessToken = await getValidAccessToken(provider);
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        error: `Per condividere via file devi prima collegare il tuo account ${label} dalle Impostazioni. (${detail})`,
      };
    }

    const doc = buildDoc(group, people, expenses, settlements);
    // WebDAV: il fileId è il percorso completo del file; conserva quello esistente.
    const existingLink =
      group.fileShare && group.fileShare.provider === provider
        ? { fileId: group.fileShare.fileId, webdav }
        : provider === "webdav"
          ? { fileId: webdavSharedPath(group.id), webdav }
          : null;
    const { fileId } = await uploadSharedDoc(provider, accessToken, existingLink, doc);
    const { shareUrl } = await makeShared(provider, accessToken, fileId);

    const fileShare: FileShareLink = {
      provider,
      fileId,
      // Drive/WebDAV non espongono uno shareUrl: conserva quello esistente se il provider lo dava.
      shareUrl: shareUrl ?? group.fileShare?.shareUrl ?? null,
      ownerName: self?.name || group.fileShare?.ownerName || "Io",
      lastSyncedAt: new Date().toISOString(),
      webdav,
    };
    onLinked?.({ ...group, fileShare, updatedAt: new Date().toISOString() });

    const payload: FileInvitePayload = {
      v: 2,
      provider,
      fileId,
      shareUrl: fileShare.shareUrl,
      groupId: group.id,
      groupName: group.name,
      emoji: group.emoji,
      currency: group.currency,
      ownerName: fileShare.ownerName,
      webdav,
    };
    const link = buildInviteLink(payload);

    if (!skipNativeShare) {
      const shareMessage = `Unisciti al gruppo "${group.name}" su SplitFree per dividere le spese:\n${link}`;
      if (Platform.OS === "web") {
        await Clipboard.setStringAsync(link);
      } else {
        try {
          await Share.share({
            message: shareMessage,
            title: `Invito a ${group.name} (SplitFree)`,
          });
        } catch {
          // L'utente ha chiuso il foglio di condivisione di sistema senza errori
        }
      }
    }

    return { ok: true, link };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Impossibile condividere via ${label}: ${detail}` };
  }
}

/**
 * Condivide un gruppo via Telegram (percorso consigliato): il documento JSON
 * diventa un documento pinnato nel gruppo Telegram dedicato, letto e scritto
 * via Bot API con il solo bot token — niente account cloud, niente registrazioni.
 *
 * Bot token e chat id arrivano dal wizard di condivisione (`creds`) oppure,
 * in loro assenza, da Impostazioni → Notifiche Telegram (stesso bot delle
 * notifiche). `tgInviteLink` (link Telegram per entrare nel gruppo, creato dal
 * wizard con createChatInviteLink) viene allegato all'invito SplitFree.
 * Il bot token entra nel link di invito: IL LINK È IL SEGRETO del gruppo.
 *
 * Mai eccezioni: ogni fallimento torna come { ok: false, error } in italiano.
 */
export async function shareGroupViaTelegram(params: {
  group: Group;
  people: Person[];
  expenses: Expense[];
  settlements: Settlement[];
  self: Person | null | undefined;
  /** Credenziali già risolte dal wizard (bot verificato + chat rilevata). */
  creds?: { botToken: string; chatId: string };
  /** Link Telegram per entrare nel gruppo, allegato all'invito SplitFree. */
  tgInviteLink?: string;
  /** Chiamato col gruppo aggiornato (campo fileShare valorizzato), pattern di oneClickShare. */
  onLinked?: (updatedGroup: Group) => void;
  skipNativeShare?: boolean;
}): Promise<FileShareResult> {
  const { group, people, expenses, settlements, self, creds, tgInviteLink, onLinked, skipNativeShare } = params;

  try {
    let botToken = creds?.botToken.trim() ?? "";
    let chatId = creds?.chatId.trim() ?? "";
    if (!botToken || !chatId) {
      // Fallback: lo store arriva via dynamic import, il modulo resta importabile ovunque.
      const { useStore } = await import("@/store/store");
      const telegram = useStore.getState().data.settings.telegram;
      botToken = telegram?.botToken.trim() ?? "";
      chatId = telegram?.chatId.trim() ?? "";
    }
    if (!botToken || !chatId) {
      return { ok: false, error: "Configura il bot Telegram nelle Impostazioni → Notifiche Telegram." };
    }

    // Verifica il token prima di pubblicare: errori chiari subito (401 → token non valido).
    await tgGetMe(botToken);

    const doc = buildDoc(group, people, expenses, settlements);
    const messageId = await publishDoc({ botToken, chatId, messageId: null }, doc);

    const fileShare: FileShareLink = {
      provider: "telegram",
      fileId: chatId,
      shareUrl: null,
      ownerName: self?.name || group.fileShare?.ownerName || "Io",
      lastSyncedAt: new Date().toISOString(),
      telegram: { botToken, chatId, messageId },
    };
    onLinked?.({ ...group, fileShare, updatedAt: new Date().toISOString() });

    const payload: FileInvitePayload = {
      v: 2,
      provider: "telegram",
      fileId: chatId,
      shareUrl: null,
      groupId: group.id,
      groupName: group.name,
      emoji: group.emoji,
      currency: group.currency,
      ownerName: fileShare.ownerName,
      telegram: { botToken, chatId, ...(tgInviteLink ? { tgInviteLink } : {}) },
    };
    const link = buildInviteLink(payload);

    if (!skipNativeShare) {
      const shareMessage = `Unisciti al gruppo "${group.name}" su SplitFree per dividere le spese:\n${link}`;
      if (Platform.OS === "web") {
        await Clipboard.setStringAsync(link);
      } else {
        try {
          await Share.share({
            message: shareMessage,
            title: `Invito a ${group.name} (SplitFree)`,
          });
        } catch {
          // L'utente ha chiuso il foglio di condivisione di sistema senza errori
        }
      }
    }

    return { ok: true, link };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Impossibile condividere via Telegram: ${detail}` };
  }
}
