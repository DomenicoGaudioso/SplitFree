/**
 * Tassi di cambio da API pubbliche gratuite, senza chiave:
 * 1. open.er-api.com (copertura ampia, aggiornamento giornaliero);
 * 2. api.frankfurter.dev (tassi BCE) come riserva.
 * Il risultato viene messo in cache nelle impostazioni e riutilizzato offline.
 */

export type FetchedRate = { rate: number; fetchedAt: string; source: string };

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

export async function fetchRate(from: string, to: string): Promise<FetchedRate | null> {
  if (from === to) return { rate: 1, fetchedAt: new Date().toISOString(), source: "identity" };
  try {
    const res = await withTimeout(fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(from)}`), 8000);
    if (res.ok) {
      const json = (await res.json()) as { result?: string; rates?: Record<string, number> };
      const rate = json.rates?.[to];
      if (json.result === "success" && typeof rate === "number" && rate > 0) {
        return { rate, fetchedAt: new Date().toISOString(), source: "open.er-api.com" };
      }
    }
  } catch {
    // passa alla riserva
  }
  try {
    const res = await withTimeout(
      fetch(`https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(from)}&symbols=${encodeURIComponent(to)}`),
      8000
    );
    if (res.ok) {
      const json = (await res.json()) as { rates?: Record<string, number> };
      const rate = json.rates?.[to];
      if (typeof rate === "number" && rate > 0) {
        return { rate, fetchedAt: new Date().toISOString(), source: "frankfurter.dev" };
      }
    }
  } catch {
    // offline o valuta non supportata
  }
  return null;
}

export function rateKey(from: string, to: string): string {
  return `${from}>${to}`;
}
