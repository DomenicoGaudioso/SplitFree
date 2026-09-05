/**
 * Modello dati dell'app. Tutti gli importi sono interi in "unità minori"
 * (centesimi per EUR/USD, unità intere per JPY) per evitare errori in virgola mobile.
 * Le date sono stringhe ISO "YYYY-MM-DD"; i timestamp sono ISO 8601 completi.
 */

export type SplitMethod = "equal" | "percentage" | "shares" | "exact";

export type Person = {
  id: string;
  name: string;
  /** Facoltativa solo per record creati prima che diventasse obbligatoria; il form la richiede sempre per le persone nuove. */
  email: string | null;
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
  /** Indica se è il progetto SplitFree Cloud predefinito. */
  isDefault?: boolean;
  /** Web Client ID OAuth di Google Cloud, per l'accesso "Continua con Google". */
  googleClientId?: string;
  /** Application (client) ID di una registrazione app Azure, per "Continua con Microsoft". */
  microsoftClientId?: string;
  createdAt: string;
};

/** Provider di condivisione via file JSON su cloud storage dell'amministratore. */
export type FileShareProvider = "gdrive" | "onedrive" | "webdav" | "telegram";

/**
 * Credenziali di un server WebDAV generico (pCloud, Koofr, Nextcloud…):
 * nessuna registrazione app richiesta, basta username + password (meglio una
 * app-password dedicata). Definita nel dominio perché compare in Settings,
 * FileShareLink e negli inviti; il client HTTP è in src/cloud/fileShare/webdav.ts.
 */
export type WebDavConfig = {
  /** URL base del server WebDAV, es. https://ewebdav.pcloud.com */
  url: string;
  username: string;
  password: string;
};

/** Connessione WebDAV salvata sul dispositivo (sincronizzazione dati + condivisione gruppi). */
export type WebDavSettings = WebDavConfig & {
  connected: boolean;
  lastSync?: string | null;
};

/**
 * Credenziali Telegram per un gruppo condiviso via file: il documento JSON è
 * un documento pinnato in un gruppo Telegram, letto e scritto via Bot API.
 * Definita nel dominio perché compare in FileShareLink e negli inviti;
 * il client HTTP è in src/cloud/fileShare/telegramSync.ts.
 *
 * IL BOT TOKEN VIAGGIA NEL LINK DI INVITO: il link è il segreto del gruppo —
 * chi lo possiede può leggere e scrivere il documento condiviso.
 */
export type TelegramShareCreds = {
  botToken: string;
  chatId: string;
  /** Id del messaggio pinnato che porta la versione corrente del documento (null finché non si è fatto il primo pull). */
  messageId: number | null;
};

/** Collega un gruppo locale al suo gemello: un file JSON sul cloud dell'amministratore. */
export type FileShareLink = {
  provider: FileShareProvider;
  /**
   * Id del file sul provider: Drive fileId, OneDrive item id.
   * Per WebDAV è il percorso completo del file, es. `/SplitFree/splitfree_group_<id>.json`.
   * Per Telegram è la chat id del gruppo che ospita il documento pinnato.
   */
  fileId: string;
  /** URL di condivisione pubblico, se il provider lo espone (per WebDAV è sempre null). */
  shareUrl: string | null;
  ownerName: string;
  lastSyncedAt: string | null;
  /**
   * Solo per WebDAV: credenziali del server che ospita il file. Viaggiano nel
   * link di invito (che va quindi trattato come un segreto) così ogni membro
   * può leggere e scrivere subito, senza collegare un proprio account.
   */
  webdav?: WebDavConfig;
  /**
   * Solo per Telegram: bot token + chat id del gruppo Telegram che ospita il
   * documento pinnato. Come per WebDAV viaggiano nel link di invito: il link
   * è il segreto del gruppo. `messageId` è la versione corrente del documento,
   * aggiornata a ogni push riuscito.
   */
  telegram?: TelegramShareCreds;
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
  /** Presente solo per i gruppi condivisi via file: documento JSON su Telegram (consigliato), WebDAV, Google Drive o OneDrive. */
  fileShare?: FileShareLink | null;
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

export type CloudStorageService = {
  connected: boolean;
  userEmail?: string | null;
  userName?: string | null;
  lastSync?: string | null;
  accessToken?: string | null;
  /** ISO di scadenza dell'access token (serve a decidere quando usare il refresh token). */
  expiresAt?: string | null;
  refreshToken?: string | null;
  /** Client ID OAuth usato per collegare l'account (serve a rinnovare i token). */
  clientId?: string | null;
};

export type CloudStorageSettings = {
  oneDrive?: CloudStorageService;
  googleDrive?: CloudStorageService;
};

/** Configurazione del bot Telegram per le notifiche di gruppo (il token è salvato solo sul dispositivo). */
export type TelegramSettings = {
  enabled: boolean;
  botToken: string;
  chatId: string;
};

export type Settings = {
  ownerName: string;
  defaultCurrency: string;
  theme: ThemePreference;
  /** Cache tassi: chiave "EUR>USD". */
  rates: Record<string, RateCacheEntry>;
  /** Progetti Firebase collegati da questo dispositivo come amministratore. */
  cloudProjects: CloudProject[];
  /** Connessioni Cloud Storage per backup (Microsoft OneDrive, Google Drive). */
  cloudStorage?: CloudStorageSettings;
  /** Connessione WebDAV generica (pCloud, Koofr, Nextcloud…): provider consigliato, senza registrazione sviluppatore. */
  webdav?: WebDavSettings;
  /** L'utente ha scelto "Continua senza account" nell'onboarding: dati solo su questo dispositivo. */
  onboardingSkipped?: boolean;
  /** Notifiche Telegram inviate quando si aggiunge una spesa o un rimborso. */
  telegram?: TelegramSettings;
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
