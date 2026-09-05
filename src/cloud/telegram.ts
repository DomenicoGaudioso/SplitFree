import { formatMinor } from "@/domain/money";
import type { Group, TelegramSettings } from "@/domain/types";

/**
 * Notifiche Telegram via Bot API: l'app chiama direttamente
 * https://api.telegram.org/bot<TOKEN>/sendMessage dal dispositivo di chi
 * esegue l'azione. Nessun server: il token del bot resta sul dispositivo.
 * Il tipo TelegramSettings vive in src/domain/types.ts per evitare cicli.
 *
 * Destinazione delle notifiche (resolveNotifyTarget): se il gruppo è condiviso
 * via Telegram la notifica va nel GRUPPO TELEGRAM del gruppo SplitFree
 * (fileShare.telegram), sempre attiva; altrimenti si usa la chat globale delle
 * Impostazioni (settings.telegram), che rispetta il flag enabled.
 */

const TELEGRAM_TIMEOUT_MS = 8000;

export type { TelegramSettings };

/**
 * Dove mandare la notifica di un'azione su un gruppo:
 * - gruppo condiviso via Telegram → le credenziali del suo gruppo Telegram
 *   (sempre attive: chi condivide via Telegram vuole le notifiche lì);
 * - altrimenti → la chat globale delle Impostazioni, così com'è (flag enabled incluso);
 * - niente configurato → null (nessuna notifica).
 * Funzione pura, testabile senza store.
 */
export function resolveNotifyTarget(
  group: Pick<Group, "fileShare"> | null | undefined,
  settings: TelegramSettings | undefined,
): TelegramSettings | null {
  const tg = group?.fileShare?.provider === "telegram" ? group.fileShare.telegram : undefined;
  if (tg?.botToken.trim() && tg?.chatId.trim()) {
    return { enabled: true, botToken: tg.botToken.trim(), chatId: tg.chatId.trim() };
  }
  return settings ?? null;
}

/** Elenco compatto di nomi: fino a 4 tutti, oltre "Primo, Secondo +N". */
export function formatNameList(names: string[]): string {
  const clean = names.map((n) => n.trim()).filter(Boolean);
  if (clean.length <= 4) return clean.join(", ");
  return `${clean.slice(0, 2).join(", ")} +${clean.length - 2}`;
}

export function formatExpenseMessage(params: {
  actorName: string;
  title: string;
  amountMinor: number;
  currency: string;
  payerNames?: string[];
  participantNames?: string[];
}): string {
  const amount = formatMinor(params.amountMinor, params.currency);
  const first = `💸 ${params.actorName} ha aggiunto "${params.title}" · ${amount}`;
  const details: string[] = [];
  if (params.payerNames?.length) details.push(`Pagato da: ${formatNameList(params.payerNames)}`);
  if (params.participantNames?.length) details.push(`Diviso fra: ${formatNameList(params.participantNames)}`);
  return details.length ? `${first}\n${details.join(" · ")}` : first;
}

export function formatExpenseEditedMessage(params: {
  actorName: string;
  title: string;
  amountMinor: number;
  currency: string;
}): string {
  const amount = formatMinor(params.amountMinor, params.currency);
  return `✏️ ${params.actorName} ha modificato "${params.title}" · ${amount}`;
}

export function formatExpenseDeletedMessage(params: { actorName: string; title: string }): string {
  return `🗑️ ${params.actorName} ha eliminato "${params.title}"`;
}

export function formatSettlementMessage(params: {
  actorName: string;
  toName: string;
  amountMinor: number;
  currency: string;
  groupName: string;
}): string {
  const amount = formatMinor(params.amountMinor, params.currency);
  return `💶 ${params.actorName} ha rimborsato ${amount} a ${params.toName} nel gruppo "${params.groupName}".`;
}

/** Invia un messaggio Telegram; non lancia mai: ritorna sempre { ok, error? }. */
export async function sendTelegramMessage(
  settings: TelegramSettings,
  text: string
): Promise<{ ok: boolean; error?: string }> {
  if (!settings.enabled || !settings.botToken.trim() || !settings.chatId.trim()) {
    return { ok: false, error: "not-configured" };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TELEGRAM_TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.telegram.org/bot${settings.botToken.trim()}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: settings.chatId.trim(), text }),
      signal: controller.signal,
    });
    if (!res.ok) {
      // Telegram risponde con { ok: false, description: "..." } anche sugli errori.
      let description = "";
      try {
        const body = (await res.json()) as { description?: string };
        if (body?.description) description = body.description;
      } catch {
        // corpo non JSON: ignora
      }
      return { ok: false, error: description || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return { ok: false, error: aborted ? "timeout" : String(err) };
  } finally {
    clearTimeout(timer);
  }
}
