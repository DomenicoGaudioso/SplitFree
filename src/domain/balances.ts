import { convertMinor } from "./money";
import { allocateByWeights } from "./split";
import type { Expense, PersonBalance, Settlement, Transfer } from "./types";

type GroupLike = { id: string; currency: string; memberIds: string[] };

function toGroupCurrency(minor: number, expense: Expense, group: GroupLike): number {
  return convertMinor(minor, expense.exchangeRate, expense.currency, group.currency);
}

/**
 * Bilancio netto per persona nel gruppo, nella valuta del gruppo.
 * net = pagato − dovuto + rimborsi inviati − rimborsi ricevuti.
 * net > 0: la persona deve ricevere; net < 0: deve dare.
 */
export function computeBalances(
  group: GroupLike,
  expenses: Expense[],
  settlements: Settlement[]
): PersonBalance[] {
  const map = new Map<string, PersonBalance>();
  const ensure = (personId: string) => {
    let b = map.get(personId);
    if (!b) {
      b = {
        personId,
        paidMinor: 0,
        owedMinor: 0,
        sentMinor: 0,
        receivedMinor: 0,
        netMinor: 0,
      };
      map.set(personId, b);
    }
    return b;
  };
  for (const id of group.memberIds) ensure(id);

  for (const e of expenses) {
    if (e.groupId !== group.id) continue;
    // Conversione per-riga con correzione dei resti: la somma delle righe
    // convertite deve coincidere con il totale convertito.
    const totalConverted = toGroupCurrency(e.amountMinor, e, group);
    const paidConv = allocateByWeights(
      totalConverted,
      e.payers.map((p) => p.amountMinor)
    );
    const owedConv = allocateByWeights(
      totalConverted,
      e.splits.map((s) => s.amountMinor)
    );
    e.payers.forEach((p, i) => {
      ensure(p.personId).paidMinor += paidConv[i];
    });
    e.splits.forEach((s, i) => {
      ensure(s.personId).owedMinor += owedConv[i];
    });
  }

  for (const s of settlements) {
    if (s.groupId !== group.id) continue;
    ensure(s.fromPersonId).sentMinor += s.amountMinor;
    ensure(s.toPersonId).receivedMinor += s.amountMinor;
  }

  for (const b of map.values()) {
    b.netMinor = b.paidMinor - b.owedMinor + b.sentMinor - b.receivedMinor;
  }
  return [...map.values()];
}

/**
 * Debiti "grezzi" persona-a-persona (non semplificati): per ogni spesa la quota
 * di ciascun partecipante viene attribuita ai pagatori in proporzione a quanto
 * hanno pagato; i rimborsi riducono il debito nella direzione opposta.
 * Restituisce solo trasferimenti netti positivi fra coppie.
 */
export function computePairwiseDebts(
  group: GroupLike,
  expenses: Expense[],
  settlements: Settlement[]
): Transfer[] {
  const owes = new Map<string, number>(); // "from>to" -> minor
  const add = (from: string, to: string, minor: number) => {
    if (from === to || minor === 0) return;
    const key = `${from}>${to}`;
    owes.set(key, (owes.get(key) ?? 0) + minor);
  };

  for (const e of expenses) {
    if (e.groupId !== group.id) continue;
    const totalPaid = e.payers.reduce((a, p) => a + p.amountMinor, 0);
    if (totalPaid === 0) continue;
    for (const s of e.splits) {
      const shareConv = toGroupCurrency(s.amountMinor, e, group);
      const parts = allocateByWeights(
        shareConv,
        e.payers.map((p) => p.amountMinor)
      );
      e.payers.forEach((p, i) => add(s.personId, p.personId, parts[i]));
    }
  }
  for (const s of settlements) {
    if (s.groupId !== group.id) continue;
    add(s.toPersonId, s.fromPersonId, s.amountMinor);
  }

  const result: Transfer[] = [];
  const seen = new Set<string>();
  for (const [key, minor] of owes) {
    const [from, to] = key.split(">");
    const pair = from < to ? `${from}|${to}` : `${to}|${from}`;
    if (seen.has(pair)) continue;
    seen.add(pair);
    const reverse = owes.get(`${to}>${from}`) ?? 0;
    const net = minor - reverse;
    if (net > 0) result.push({ fromPersonId: from, toPersonId: to, amountMinor: net });
    else if (net < 0) result.push({ fromPersonId: to, toPersonId: from, amountMinor: -net });
  }
  return result.sort((a, b) => b.amountMinor - a.amountMinor);
}
