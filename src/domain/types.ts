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

/**
 * Configurazione pubblica di un progetto Firebase (non è un segreto: la
 * sicurezza dei dati è garantita dalle regole di Firestore, non da questi
 * valori). Serve per collegare l'app al progetto cloud dell'amministratore
 * di un gruppo condiviso.
 */
export type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
};

/**
 * Un progetto Firebase collegato da questo dispositivo in qualità di
 * amministratore: può ospitare più gruppi condivisi.
 */
export type CloudProject = {
  id: string;
  label: string;
  config: FirebaseWebConfig;
  /** Web Client ID OAuth di Google Cloud, per l'accesso "Continua con Google". */
  googleClientId?: string;
  /** Application (client) ID di una registrazione app Azure, per "Continua con Microsoft". */
  microsoftClientId?: string;
  createdAt: string;
};

/** Collega un gruppo locale al suo gemello su Firestore. Auto-contenuto: chi si unisce via invito non deve possedere il progetto. */
export type GroupCloudLink = {
  config: FirebaseWebConfig;
  googleClientId?: string;
  microsoftClientId?: string;
  /** Id del documento Firestore (di solito uguale a Group.id). */
  remoteId: string;
  ownerUid: string;
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
  /** Presente solo per i gruppi condivisi: dati sincronizzati in tempo reale su Firestore. */
  cloud?: GroupCloudLink | null;
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
  /** Progetti Firebase collegati da questo dispositivo come amministratore. */
  cloudProjects: CloudProject[];
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
