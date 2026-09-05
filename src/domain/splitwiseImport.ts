/**
 * Import di spese da un CSV esportato da Splitwise.
 * Modulo puro: nessun import expo/react-native, gira anche in Node (test).
 *
 * Formato atteso:
 *   Data,Descrizione,Categorie,Costo,Valuta,<NomePersona1>,<NomePersona2>,...
 *   2024-01-01,Spese condominiali 1 rata,Generali,481.44,USD,-240.72,240.72
 *
 * Le colonne dopo "Valuta" sono i membri del gruppo: il valore è il netto
 * (pagato meno quota); positivo = ha pagato più della sua quota. Da lì si
 * ricostruiscono payers e splits in centesimi interi.
 */
import { guessFromTitle } from "./categories";
import { isValidIsoDate } from "./dates";

export type ParsedRow = {
  /** Data validata "YYYY-MM-DD". */
  date: string;
  title: string;
  /** Categoria grezza come scritta nel CSV. */
  category: string;
  currency: string;
  amountMinor: number;
  payers: { name: string; amountMinor: number }[];
  splits: { name: string; amountMinor: number }[];
};

export type SplitwiseParseResult =
  | { ok: true; people: string[]; rows: ParsedRow[]; skipped: number }
  | { ok: false; error: string };

/** Tokenizer CSV: gestisce campi fra virgolette, virgole interne e doppi apici escaped (""). */
function tokenizeCsv(text: string): string[][] {
  const s = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function parseNumber(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function isSummaryRow(title: string): boolean {
  const t = title.trim().toLowerCase();
  return t === "bilancio totale" || t === "total balance";
}

/**
 * Ricostruisce payers e splits di una riga preservando i netti esatti del CSV
 * (paid_i - share_i = net_i per ogni persona), con vincoli paid_i >= 0,
 * share_i >= 0 e somme = amountMinor.
 *
 * Algoritmo "water-filling": si parte dallo split equo fra i partecipanti non
 * fissati; se qualche paid_i < 0 (es. quota interamente attribuita ad altri,
 * come `Bus,36.00,-36.00,36.00`), si fissa il più negativo con paid_i = 0 e
 * share_i = -net_i, poi si ridistribuisce il costo residuo fra i restanti.
 */
function buildAmounts(
  amountMinor: number,
  nets: { name: string; netMinor: number }[]
): { payers: { name: string; amountMinor: number }[]; splits: { name: string; amountMinor: number }[] } {
  const n = nets.length;
  const share = new Array<number>(n).fill(0);
  const fixed = new Array<boolean>(n).fill(false);
  let remaining = amountMinor;
  let activeCount = n;
  while (activeCount > 0) {
    const base = Math.floor(remaining / activeCount);
    const rem = remaining - base * activeCount;
    // Il resto va ai partecipanti attivi col netto più alto (contributo più grande).
    const activeIdx = nets
      .map((_, i) => i)
      .filter((i) => !fixed[i])
      .sort((a, b) => nets[b].netMinor - nets[a].netMinor);
    for (let k = 0; k < activeIdx.length; k++) share[activeIdx[k]] = base + (k < rem ? 1 : 0);
    // Cerca il paid più negativo fra gli attivi.
    let worst = -1;
    let worstPaid = 0;
    for (const i of activeIdx) {
      const paid = nets[i].netMinor + share[i];
      if (paid < worstPaid) {
        worstPaid = paid;
        worst = i;
      }
    }
    if (worst < 0) break; // tutti i paid >= 0: split equo va bene
    // Fissa: paid = 0, share = -net (clamp difensivo su netti incoerenti).
    const s = Math.max(0, Math.min(-nets[worst].netMinor, remaining));
    share[worst] = s;
    fixed[worst] = true;
    remaining -= s;
    activeCount -= 1;
  }
  // Guardia degenere: le quote devono sommare esattamente amountMinor.
  const shareDiff = amountMinor - share.reduce((a, s) => a + s, 0);
  if (shareDiff !== 0) {
    let maxIdx = 0;
    for (let i = 1; i < n; i++) if (share[i] > share[maxIdx]) maxIdx = i;
    share[maxIdx] = Math.max(0, share[maxIdx] + shareDiff);
  }
  const splits = nets.map((p, i) => ({ name: p.name, amountMinor: share[i] }));
  const paid = nets.map((p, i) => ({ name: p.name, amountMinor: Math.max(0, p.netMinor + share[i]) }));
  // Aggiusta eventuali resti di arrotondamento del CSV sul pagante più grande.
  const diff = amountMinor - paid.reduce((a, p) => a + p.amountMinor, 0);
  if (diff !== 0) {
    let maxIdx = 0;
    for (let i = 1; i < paid.length; i++) if (paid[i].amountMinor > paid[maxIdx].amountMinor) maxIdx = i;
    paid[maxIdx].amountMinor += diff;
  }
  return { payers: paid.filter((p) => p.amountMinor > 0), splits };
}

/**
 * Esegue il parse del testo CSV. Le righe non valide (vuote, riepiloghi
 * "Bilancio totale", data non valida, costo non numerico) vengono saltate
 * e conteggiate in `skipped`.
 */
export function parseSplitwiseCsv(text: string): SplitwiseParseResult {
  const table = tokenizeCsv(text);
  const headerIdx = table.findIndex((r) => r.some((c) => c.trim() !== ""));
  if (headerIdx < 0) return { ok: false, error: "Il file è vuoto." };
  const header = table[headerIdx].map((c) => c.trim());
  if (header.length < 6 || !/^(data|date)$/i.test(header[0])) {
    return {
      ok: false,
      error: "Il file non sembra un export CSV di Splitwise (intestazione attesa: Data,Descrizione,Categorie,Costo,Valuta,<membri…>).",
    };
  }
  const people = header.slice(5).filter((name) => name !== "");
  if (people.length === 0) {
    return { ok: false, error: "Nell'intestazione mancano le colonne dei membri del gruppo." };
  }

  const rows: ParsedRow[] = [];
  let skipped = 0;
  for (let r = headerIdx + 1; r < table.length; r++) {
    const cells = table[r];
    if (cells.every((c) => c.trim() === "")) continue; // riga vuota
    const get = (idx: number) => (cells[idx] ?? "").trim();
    const date = get(0);
    const title = get(1);
    const category = get(2);
    const costRaw = get(3);
    const currency = get(4);
    if (isSummaryRow(title) || costRaw === "") {
      skipped++;
      continue;
    }
    const cost = parseNumber(costRaw);
    if (!isValidIsoDate(date) || title === "" || cost === null) {
      skipped++;
      continue;
    }
    const amountMinor = Math.round(cost * 100);
    // Netti per persona: cella vuota = 0, cella non numerica = riga invalida.
    const nets: { name: string; netMinor: number }[] = [];
    let invalid = false;
    for (let p = 0; p < people.length; p++) {
      const raw = get(5 + p);
      if (raw === "") continue;
      const v = parseNumber(raw);
      if (v === null) {
        invalid = true;
        break;
      }
      if (v !== 0) nets.push({ name: people[p], netMinor: Math.round(v * 100) });
    }
    if (invalid || amountMinor <= 0 || nets.length === 0) {
      skipped++;
      continue;
    }
    const { payers, splits } = buildAmounts(amountMinor, nets);
    rows.push({ date, title, category, currency, amountMinor, payers, splits });
  }
  return { ok: true, people, rows, skipped };
}

/**
 * Mappa le categorie degli export Splitwise (italiani) sugli id di
 * src/domain/categories.ts. Valore "" = categoria generica: si deduce dal titolo.
 */
const SPLITWISE_CATEGORY_MAP: Record<string, string> = {
  generali: "",
  pagamento: "",
  alimentari: "groceries",
  ristorante: "food",
  "autobus/treno": "transport",
  taxi: "transport",
  carburante: "fuel",
  auto: "fuel",
  "tv/telefono/internet": "utilities",
  "riscaldamento/gas": "utilities",
  elettricita: "utilities",
  acqua: "utilities",
  casa: "home",
  arredamento: "home",
  hotel: "lodging",
  viaggi: "travel",
  viaggio: "travel",
  regali: "gifts",
  "spese mediche": "health",
  salute: "health",
  sport: "sport",
  istruzione: "education",
  "animali domestici": "pets",
  elettronica: "tech",
  abbigliamento: "shopping",
  vestiti: "shopping",
};

function normalizeCategory(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Id categoria per una riga importata: mappa Splitwise, poi deduzione dal titolo, poi "other". */
export function categoryIdFor(csvCategory: string, title: string): string {
  const key = normalizeCategory(csvCategory);
  const mapped = SPLITWISE_CATEGORY_MAP[key];
  if (mapped) return mapped;
  if (mapped === undefined && key.startsWith("intrattenimento")) return "entertainment";
  return guessFromTitle(title).categoryId;
}
