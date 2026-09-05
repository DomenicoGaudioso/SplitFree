import { formatMinor } from "@/domain/money";
import type { TelegramSettings } from "@/domain/types";

/**
 * Notifiche Telegram via Bot API: l'app chiama direttamente
 * https://api.telegram.org/bot<TOKEN>/sendMessage dal dispositivo di chi
 * esegue l'azione. Nessun server: il token del bot resta sul dispositivo.
 * Il tipo TelegramSettings vive in src/domain/types.ts per evitare cicli.
 */

const TELEGRAM_TIMEOUT_MS = 8000;

export type { TelegramSettings };

export function formatExpenseMessage(params: {
  actorName: string;
  title: string;
  amountMinor: number;
  currency: string;
  groupName: string;
}): string {
  const amount = formatMinor(params.amountMinor, params.currency);
  return `💸 ${params.actorName} ha aggiunto "${params.title}" (${amount}) nel gruppo "${params.groupName}".`;
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
