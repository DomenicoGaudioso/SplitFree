/**
 * Modello dati dell'app. Tutti gli importi sono interi in "unità minori"
 * (centesimi per EUR/USD, unità intere per JPY) per evitare errori in virgola mobile.
 * Le date sono stringhe ISO "YYYY-MM-DD"; i timestamp sono ISO 8601 completi.
 */

export type SplitMethod = "equal" | "percentage" | "shares" | "exact";

export type Person = {
  id: string;
  name: string;
  color: string;
  isSelf: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Group = {
  id: string;
  name: string;
  emoji: string;
  description: string;
  currency: string;
  memberIds: string[];
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Payment = {
  personId: string;
  amountMinor: number;
};

export type Split = {
  personId: string;
  amountMinor: number;
  /** Percentuale (0..100) quando splitMethod = "percentage". */
  percent?: number;
  /** Numero di quote quando splitMethod = "shares". */
  shares?: number;
};

export type Expense = {
  id: string;
  groupId: string;
  title: string;
  notes: string;
  categoryId: string;
  /** Data della spesa, "YYYY-MM-DD". */
  date: string;
  currency: string;
  amountMinor: number;
  /** Tasso di conversione verso la valuta del gruppo (1 se coincidono). */
  exchangeRate: number;
  splitMethod: SplitMethod;
  payers: Payment[];
  splits: Split[];
  createdAt: string;
  updatedAt: string;
};

export type Settlement = {
  id: string;
  groupId: string;
  fromPersonId: string;
  toPersonId: string;
  amountMinor: number;
  date: string;
  note: string;
  createdAt: string;
};

export type Attachment = {
  id: string;
  expenseId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** Chiave di archiviazione: percorso relativo su nativo, chiave IndexedDB su web. */
  storageKey: string;
  width: number | null;
  height: number | null;
  createdAt: string;
};

export type ThemePreference = "system" | "light" | "dark";

export type RateCacheEntry = {
  rate: number;
  fetchedAt: string;
};

export type Settings = {
  ownerName: string;
  defaultCurrency: string;
  theme: ThemePreference;
  /** Cache tassi: chiave "EUR>USD". */
  rates: Record<string, RateCacheEntry>;
};

export const DATA_VERSION = 1;

export type AppData = {
  version: typeof DATA_VERSION;
  people: Person[];
  groups: Group[];
  expenses: Expense[];
  settlements: Settlement[];
  attachments: Attachment[];
  settings: Settings;
};

export type PersonBalance = {
  personId: string;
  paidMinor: number;
  owedMinor: number;
  sentMinor: number;
  receivedMinor: number;
  /** > 0: deve ricevere; < 0: deve dare. */
  netMinor: number;
};

export type Transfer = {
  fromPersonId: string;
  toPersonId: string;
  amountMinor: number;
};
