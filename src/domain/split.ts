import type { Split, SplitMethod } from "./types";

export type SplitParticipant = {
  personId: string;
  /** Percentuale per "percentage", quote per "shares", importo in unità minori per "exact". */
  value?: number;
};

export type SplitResult =
  | { ok: true; splits: Split[] }
  | { ok: false; error: string };

/**
 * Ripartisce `totalMinor` fra i partecipanti secondo pesi (non negativi),
 * garantendo che la somma delle parti sia esattamente `totalMinor`.
 * I resti di arrotondamento vengono assegnati con il metodo del massimo resto
 * (Hamilton), in ordine deterministico: a parità di resto vince chi viene prima.
 */
export function allocateByWeights(totalMinor: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight <= 0) {
    return weights.map(() => 0);
  }
  const sign = totalMinor < 0 ? -1 : 1;
  const abs = Math.abs(totalMinor);
  const raw = weights.map((w) => (abs * w) / totalWeight);
  const floors = raw.map((r) => Math.floor(r + 1e-9));
  let remainder = abs - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r + 1e-9) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  const result = [...floors];
  let k = 0;
  while (remainder > 0) {
    const idx = order[k % n].i;
    if (weights[idx] > 0) {
      result[idx] += 1;
      remainder -= 1;
    }
    k += 1;
    if (k > n * (abs + 1)) break;
  }
  return result.map((v) => v * sign);
}

/**
 * Calcola gli split di una spesa.
 * - equal: parti uguali fra i partecipanti;
 * - percentage: `value` è la percentuale (somma 100);
 * - shares: `value` è il numero di quote (>= 0, almeno una > 0);
 * - exact: `value` è l'importo esatto in unità minori (somma = totale).
 */
export function computeSplits(
  totalMinor: number,
  method: SplitMethod,
  participants: SplitParticipant[]
): SplitResult {
  if (!Number.isInteger(totalMinor) || totalMinor < 0) {
    return { ok: false, error: "Importo non valido." };
  }
  if (participants.length === 0) {
    return { ok: false, error: "Seleziona almeno un partecipante." };
  }
  const ids = new Set(participants.map((p) => p.personId));
  if (ids.size !== participants.length) {
    return { ok: false, error: "Partecipanti duplicati." };
  }

  switch (method) {
    case "equal": {
      const amounts = allocateByWeights(
        totalMinor,
        participants.map(() => 1)
      );
      return {
        ok: true,
        splits: participants.map((p, i) => ({
          personId: p.personId,
          amountMinor: amounts[i],
        })),
      };
    }
    case "percentage": {
      const percents = participants.map((p) => p.value ?? 0);
      if (percents.some((v) => !Number.isFinite(v) || v < 0)) {
        return { ok: false, error: "Percentuali non valide." };
      }
      const sum = percents.reduce((a, b) => a + b, 0);
      if (Math.abs(sum - 100) > 0.01) {
        return {
          ok: false,
          error: `Le percentuali sommano a ${round2(sum)}% invece di 100%.`,
        };
      }
      const amounts = allocateByWeights(totalMinor, percents);
      return {
        ok: true,
        splits: participants.map((p, i) => ({
          personId: p.personId,
          amountMinor: amounts[i],
          percent: percents[i],
        })),
      };
    }
    case "shares": {
      const shares = participants.map((p) => p.value ?? 0);
      if (shares.some((v) => !Number.isFinite(v) || v < 0)) {
        return { ok: false, error: "Quote non valide." };
      }
      if (shares.reduce((a, b) => a + b, 0) <= 0) {
        return { ok: false, error: "Inserisci almeno una quota maggiore di zero." };
      }
      const amounts = allocateByWeights(totalMinor, shares);
      return {
        ok: true,
        splits: participants.map((p, i) => ({
          personId: p.personId,
          amountMinor: amounts[i],
          shares: shares[i],
        })),
      };
    }
    case "exact": {
      const amounts = participants.map((p) => p.value ?? 0);
      if (amounts.some((v) => !Number.isInteger(v) || v < 0)) {
        return { ok: false, error: "Importi non validi." };
      }
      const sum = amounts.reduce((a, b) => a + b, 0);
      if (sum !== totalMinor) {
        return {
          ok: false,
          error: "La somma degli importi non coincide con il totale.",
        };
      }
      return {
        ok: true,
        splits: participants.map((p, i) => ({
          personId: p.personId,
          amountMinor: amounts[i],
        })),
      };
    }
    default:
      return { ok: false, error: "Metodo di divisione sconosciuto." };
  }
}

/** Verifica che i pagamenti coprano esattamente il totale. */
export function validatePayments(
  totalMinor: number,
  payments: { personId: string; amountMinor: number }[]
): string | null {
  if (payments.length === 0) return "Indica chi ha pagato.";
  if (payments.some((p) => !Number.isInteger(p.amountMinor) || p.amountMinor < 0)) {
    return "Importi pagati non validi.";
  }
  const sum = payments.reduce((a, p) => a + p.amountMinor, 0);
  if (sum !== totalMinor) {
    return "La somma di quanto pagato non coincide con il totale.";
  }
  return null;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
