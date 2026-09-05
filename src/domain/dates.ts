const MONTHS_SHORT = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const MONTHS_LONG = [
  "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Data locale odierna come "YYYY-MM-DD". */
export function todayIso(): string {
  return toIsoDate(new Date());
}

export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

/** "YYYY-MM-DD" -> "12 mar 2026". */
export function formatIsoDate(s: string, style: "short" | "long" = "short"): string {
  if (!isValidIsoDate(s)) return s;
  const [y, m, d] = s.split("-").map(Number);
  const months = style === "long" ? MONTHS_LONG : MONTHS_SHORT;
  return `${d} ${months[m - 1]} ${y}`;
}

/** "YYYY-MM-DD" -> "12/03/2026". */
export function isoToItalian(s: string): string {
  if (!isValidIsoDate(s)) return "";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

/** "12/03/2026" o "12/3/26" -> "YYYY-MM-DD" (null se non valida). */
export function italianToIso(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})$/);
  if (!m) return null;
  let year = Number(m[3]);
  if (m[3].length === 2) year += 2000;
  const iso = `${year}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
  return isValidIsoDate(iso) ? iso : null;
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d + days);
  return toIsoDate(date);
}

/** "YYYY-MM" della data. */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/** Etichetta breve del mese: "mar 26". Chiave malformata → restituita com'è (mai crash). */
export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const name = MONTHS_SHORT[m - 1];
  if (!name || !Number.isFinite(y)) return key;
  return `${name} ${String(y).slice(2)}`;
}

export function monthLabelLong(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const name = MONTHS_LONG[m - 1];
  if (!name || !Number.isFinite(y)) return key || "—";
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${y}`;
}

/** Ultimi n mesi (incluso il corrente) come chiavi "YYYY-MM", dal più vecchio. */
export function lastMonths(n: number, from: Date = new Date()): string[] {
  const result: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(from.getFullYear(), from.getMonth() - i, 1);
    result.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  }
  return result;
}

/** Etichetta relativa: "Oggi", "Ieri", altrimenti data breve. */
export function relativeDateLabel(iso: string, today = todayIso()): string {
  if (iso === today) return "Oggi";
  if (iso === addDays(today, -1)) return "Ieri";
  return formatIsoDate(iso);
}
