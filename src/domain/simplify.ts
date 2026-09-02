import type { PersonBalance, Transfer } from "./types";

/**
 * Semplificazione dei debiti: dato il bilancio netto di ogni persona, calcola
 * un insieme di trasferimenti che azzera tutti i bilanci con il minor numero
 * pratico di transazioni.
 *
 * Strategia in due passi:
 * 1. accoppiamento esatto: se un debitore e un creditore hanno importi uguali
 *    e opposti si chiudono con una sola transazione (riduce sotto n−1);
 * 2. greedy: si abbina il maggior creditore con il maggior debitore e si
 *    trasferisce il minimo dei due; ogni passo azzera almeno una persona,
 *    quindi le transazioni sono al più n−1.
 *
 * Il problema esatto è NP-difficile; per piccoli gruppi si prova anche una
 * ricerca di sotto-insiemi a somma zero di dimensione 3 per migliorare il greedy.
 */
export function simplifyDebts(balances: PersonBalance[]): Transfer[] {
  const nets = new Map<string, number>();
  for (const b of balances) {
    if (b.netMinor !== 0) nets.set(b.personId, b.netMinor);
  }
  const total = [...nets.values()].reduce((a, b) => a + b, 0);
  if (total !== 0) {
    // I bilanci dovrebbero sommare a zero; in caso di incoerenza (dati corrotti)
    // si assorbe la differenza sul primo elemento per non entrare in loop.
    const first = [...nets.keys()][0];
    if (first !== undefined) nets.set(first, (nets.get(first) ?? 0) - total);
  }

  const transfers: Transfer[] = [];

  // Passo 1: coppie esatte.
  let changed = true;
  while (changed) {
    changed = false;
    const creditors = [...nets.entries()].filter(([, v]) => v > 0);
    const debtors = [...nets.entries()].filter(([, v]) => v < 0);
    for (const [cId, cVal] of creditors) {
      const match = debtors.find(([dId, dVal]) => -dVal === cVal && nets.get(dId) === dVal && nets.get(cId) === cVal);
      if (match) {
        transfers.push({ fromPersonId: match[0], toPersonId: cId, amountMinor: cVal });
        nets.delete(cId);
        nets.delete(match[0]);
        changed = true;
        break;
      }
    }
  }

  // Passo 2: terne a somma zero (solo per gruppi piccoli, costo O(n^3)).
  const remaining = [...nets.entries()];
  if (remaining.length <= 12) {
    changed = true;
    while (changed) {
      changed = false;
      const entries = [...nets.entries()];
      outer: for (let i = 0; i < entries.length; i++) {
        for (let j = i + 1; j < entries.length; j++) {
          for (let k = j + 1; k < entries.length; k++) {
            const trio = [entries[i], entries[j], entries[k]];
            if (trio[0][1] + trio[1][1] + trio[2][1] !== 0) continue;
            const pos = trio.filter(([, v]) => v > 0);
            const neg = trio.filter(([, v]) => v < 0);
            if (pos.length === 0 || neg.length === 0) continue;
            // Chiudiamo la terna con 2 transazioni.
            if (pos.length === 1) {
              for (const [dId, dVal] of neg) {
                transfers.push({ fromPersonId: dId, toPersonId: pos[0][0], amountMinor: -dVal });
              }
            } else {
              for (const [cId, cVal] of pos) {
                transfers.push({ fromPersonId: neg[0][0], toPersonId: cId, amountMinor: cVal });
              }
            }
            for (const [id] of trio) nets.delete(id);
            changed = true;
            break outer;
          }
        }
      }
    }
  }

  // Passo 3: greedy.
  const creditors = [...nets.entries()]
    .filter(([, v]) => v > 0)
    .map(([id, v]) => ({ id, v }));
  const debtors = [...nets.entries()]
    .filter(([, v]) => v < 0)
    .map(([id, v]) => ({ id, v: -v }));
  creditors.sort((a, b) => b.v - a.v || a.id.localeCompare(b.id));
  debtors.sort((a, b) => b.v - a.v || a.id.localeCompare(b.id));
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const c = creditors[ci];
    const d = debtors[di];
    const amount = Math.min(c.v, d.v);
    if (amount > 0) {
      transfers.push({ fromPersonId: d.id, toPersonId: c.id, amountMinor: amount });
    }
    c.v -= amount;
    d.v -= amount;
    if (c.v === 0) ci += 1;
    if (d.v === 0) di += 1;
  }

  return transfers.sort((a, b) => b.amountMinor - a.amountMinor);
}

/** Verifica che i trasferimenti azzerino i bilanci: utile nei test. */
export function transfersSettle(balances: PersonBalance[], transfers: Transfer[]): boolean {
  const nets = new Map<string, number>();
  for (const b of balances) nets.set(b.personId, b.netMinor);
  for (const t of transfers) {
    nets.set(t.fromPersonId, (nets.get(t.fromPersonId) ?? 0) + t.amountMinor);
    nets.set(t.toPersonId, (nets.get(t.toPersonId) ?? 0) - t.amountMinor);
  }
  return [...nets.values()].every((v) => v === 0);
}
