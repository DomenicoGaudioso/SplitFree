/**
 * Eliminazione di una persona dallo storico: le sue quote e i suoi pagamenti
 * vengono ripartiti sui partecipanti rimasti, i rimborsi che la coinvolgono
 * vengono rimossi. Modulo puro (Node-safe): `now` viene passato dal chiamante.
 *
 * Regole:
 * - splits: le quote della persona spariscono e il totale viene riallocato
 *   proporzionalmente sulle quote rimaste (tutte zero → equamente); la somma
 *   resta esattamente amountMinor. Il metodo di divisione non è più
 *   rappresentabile fedelmente (percentuali/quote non tornerebbero): la spesa
 *   toccata diventa "exact" con gli importi finali e perde percent/shares.
 * - payers: stesso criterio proporzionale sui paganti rimasti; se la persona
 *   era l'unico pagante, l'intero importo va al primo partecipante rimasto nei
 *   splits (deterministico). La somma resta esattamente amountMinor.
 * - Se non resta nessuno nei splits la spesa viene eliminata.
 * - I settlements che coinvolgono la persona vengono eliminati (sono storico
 *   di pagamenti; i saldi restano coerenti con la ridistribuzione sulle spese).
 */
import { allocateByWeights } from "./split";
import type { Expense, Payment, Settlement, Split } from "./types";

export type RemovePersonResult = {
  expenses: Expense[];
  settlements: Settlement[];
  removedExpenses: number;
  updatedExpenses: number;
  removedSettlements: number;
};

/** Ridistribuisce `totalMinor` sulle voci rimaste, proporzionalmente agli importi attuali. */
function reallocate<T extends { personId: string; amountMinor: number }>(totalMinor: number, items: T[]): { personId: string; amountMinor: number }[] {
  const weights = items.map((p) => p.amountMinor);
  const amounts = allocateByWeights(totalMinor, weights.some((w) => w > 0) ? weights : items.map(() => 1));
  return items.map((p, i) => ({ personId: p.personId, amountMinor: amounts[i] }));
}

export function removePersonFromExpenses(
  expenses: Expense[],
  settlements: Settlement[],
  personId: string,
  now: string
): RemovePersonResult {
  const outExpenses: Expense[] = [];
  let removedExpenses = 0;
  let updatedExpenses = 0;

  for (const e of expenses) {
    const inSplits = e.splits.some((s) => s.personId === personId);
    const inPayers = e.payers.some((p) => p.personId === personId);
    if (!inSplits && !inPayers) {
      outExpenses.push(e);
      continue;
    }
    const remainingSplits = e.splits.filter((s) => s.personId !== personId);
    if (remainingSplits.length === 0) {
      // Era l'unico partecipante: la spesa non ha più senso.
      removedExpenses++;
      continue;
    }
    updatedExpenses++;
    const newSplits: Split[] = reallocate(e.amountMinor, remainingSplits);
    const remainingPayers = e.payers.filter((p) => p.personId !== personId);
    const newPayers: Payment[] =
      remainingPayers.length === 0
        ? [{ personId: newSplits[0].personId, amountMinor: e.amountMinor }]
        : reallocate(e.amountMinor, remainingPayers);
    outExpenses.push({
      ...e,
      // Le quote ricalcolate non rispettano più percentuali/quote/parità:
      // metodo convertito a "exact" con gli importi finali (senza percent/shares).
      splitMethod: inSplits ? "exact" : e.splitMethod,
      payers: newPayers,
      splits: newSplits,
      updatedAt: now,
    });
  }

  const outSettlements = settlements.filter((s) => s.fromPersonId !== personId && s.toPersonId !== personId);
  return {
    expenses: outExpenses,
    settlements: outSettlements,
    removedExpenses,
    updatedExpenses,
    removedSettlements: settlements.length - outSettlements.length,
  };
}
