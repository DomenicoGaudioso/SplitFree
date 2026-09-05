import { create } from "zustand";
import type {
  AppData,
  Attachment,
  CloudProject,
  CloudStorageService,
  Expense,
  FirebaseWebConfig,
  Group,
  Payment,
  Person,
  Settings,
  Settlement,
  Split,
  SplitMethod,
  TelegramSettings,
  WebDavSettings,
} from "@/domain/types";
import { DEFAULT_CATEGORY_ID } from "@/domain/categories";
import { removePersonFromExpenses } from "@/domain/removePerson";
import { applyImportOptions, categoryIdFor, type ImportOptions, type ParsedRow } from "@/domain/splitwiseImport";
import { normalizeEmail } from "@/domain/validate";
import { getDefaultCloudProject } from "@/cloud/defaultConfig";
import { applySharedDocToData } from "@/cloud/fileShare/apply";
import type { SharedGroupDoc } from "@/cloud/fileShare/types";
import { deleteExpenseAttachmentFiles } from "./attachments";
import { nowIso, uuid } from "./ids";
import { emptyData, loadData, migrate, saveData } from "./persistence";
import { rateKey } from "./rates";

/**
 * Hook di sincronizzazione cloud, registrati dall'app all'avvio
 * (`registerCloudSync` in app/_layout.tsx con le funzioni di src/cloud/dataSync.ts).
 * Lo store non importa dataSync per evitare un ciclo di import: è dataSync che
 * dipende dallo store, non il contrario.
 */
type CloudSyncHooks = {
  /** Chiamato dopo ogni commit: tipicamente programma l'upload dell'AppData sul cloud. */
  onCommit?: (data: AppData) => void;
  /** Chiamato durante hydrate(): tipicamente scarica i dati remoti se più recenti. */
  pullOnStart?: (data: AppData) => Promise<void>;
};

let cloudSyncHooks: CloudSyncHooks = {};

export function registerCloudSync(hooks: CloudSyncHooks): void {
  cloudSyncHooks = hooks;
}

/** Timeout del pull iniziale dal cloud: l'app si apre comunque, anche offline. */
const CLOUD_PULL_TIMEOUT_MS = 8000;

export const PERSON_COLORS = [
  "#4F46E5", "#0EA5E9", "#10B981", "#F59E0B", "#EF4444", "#EC4899",
  "#8B5CF6", "#14B8A6", "#F97316", "#84CC16", "#06B6D4", "#A855F7",
];

export type ExpenseInput = {
  groupId: string;
  title: string;
  notes: string;
  categoryId: string;
  date: string;
  currency: string;
  amountMinor: number;
  exchangeRate: number;
  splitMethod: SplitMethod;
  payers: Payment[];
  splits: Split[];
};

export type GroupInput = {
  name: string;
  emoji: string;
  description: string;
  currency: string;
  memberIds: string[];
};

type Store = {
  data: AppData;
  hydrated: boolean;
  hydrate: () => Promise<void>;

  addPerson: (input: { name: string; email: string | null; color?: string; isSelf?: boolean }) => Person;
  updatePerson: (id: string, patch: Partial<Pick<Person, "name" | "email" | "color">>) => void;
  archivePerson: (id: string, archived: boolean) => void;
  deletePerson: (
    id: string
  ) =>
    | { ok: true; removedExpenses: number; updatedExpenses: number; removedSettlements: number }
    | { ok: false; reason: string };

  addGroup: (input: GroupInput) => Group;
  updateGroup: (id: string, patch: Partial<GroupInput>) => void;
  archiveGroup: (id: string, archived: boolean) => void;
  deleteGroup: (id: string) => Promise<void>;

  addExpense: (input: ExpenseInput) => Expense;
  updateExpense: (id: string, input: ExpenseInput) => void;
  deleteExpense: (id: string) => Promise<void>;

  /** Importa righe da un CSV Splitwise: crea le persone mancanti e le spese del gruppo. */
  importSplitwiseRows: (
    groupId: string,
    rows: ParsedRow[],
    options?: ImportOptions
  ) => { ok: true; added: number; peopleCreated: number; skippedByDate: number } | { ok: false; error: string };

  /** Elimina le spese del gruppo con data < isoDate (i rimborsi restano). Ritorna quante ne ha eliminate. */
  deleteExpensesBefore: (groupId: string, isoDate: string) => Promise<number>;

  addSettlement: (input: Omit<Settlement, "id" | "createdAt">) => Settlement;
  deleteSettlement: (id: string) => void;

  addAttachment: (att: Omit<Attachment, "createdAt">) => Attachment;
  removeAttachment: (id: string) => void;

  updateSettings: (patch: Partial<Settings>) => void;
  updateTelegramSettings: (patch: Partial<TelegramSettings>) => void;
  updateCloudStorage: (service: "oneDrive" | "googleDrive", patch: Partial<CloudStorageService>) => void;
  updateWebdavSettings: (patch: Partial<WebDavSettings>) => void;
  cacheRate: (from: string, to: string, rate: number) => void;

  addCloudProject: (input: { label: string; config: FirebaseWebConfig; googleClientId?: string; microsoftClientId?: string }) => CloudProject;
  updateCloudProject: (id: string, patch: Partial<Pick<CloudProject, "label" | "googleClientId" | "microsoftClientId">>) => void;
  removeCloudProject: (id: string) => void;

  /** Registra (o aggiorna) localmente un gruppo condiviso: usato dopo la creazione o l'adesione via invito. */
  upsertCloudGroupPointer: (group: Group) => void;

  /** Applica un documento condiviso via file (già fuso) al gruppo: upsert persone/spese/rimborsi del solo gruppo. */
  applySharedDoc: (groupId: string, doc: SharedGroupDoc) => void;

  /** Sostituisce tutti i dati con quelli scaricati dal cloud (validati e migrati). */
  replaceAllData: (data: AppData) => void;

  replaceAll: (data: AppData) => void;
  resetAll: () => void;
};

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist(data: AppData) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void saveData(data);
  }, 250);
}

function ensureSelf(data: AppData): AppData {
  if (data.people.some((p) => p.isSelf)) return data;
  const ts = nowIso();
  const self: Person = {
    id: uuid(),
    name: data.settings.ownerName || "Io",
    email: null,
    color: PERSON_COLORS[0],
    isSelf: true,
    archivedAt: null,
    createdAt: ts,
    updatedAt: ts,
  };
  return { ...data, people: [self, ...data.people] };
}

function ensureDefaults(data: AppData): AppData {
  let res = ensureSelf(data);
  if (!res.settings.cloudProjects || res.settings.cloudProjects.length === 0) {
    res = {
      ...res,
      settings: {
        ...res.settings,
        cloudProjects: [getDefaultCloudProject()],
      },
    };
  }
  return res;
}

export const useStore = create<Store>((set, get) => {
  const commit = (updater: (d: AppData) => AppData) => {
    const next = updater(get().data);
    set({ data: next });
    schedulePersist(next);
    try {
      cloudSyncHooks.onCommit?.(next);
    } catch (err) {
      console.warn("Trigger di sincronizzazione cloud fallito", err);
    }
    return next;
  };

  return {
    data: ensureDefaults(emptyData()),
    hydrated: false,

    hydrate: async () => {
      const loaded = ensureDefaults(await loadData());
      set({ data: loaded });
      // Pull iniziale dal cloud personale (se c'è un provider attivo): con timeout
      // di 8s così l'app si apre comunque quando si è offline. Il pull può
      // sostituire i dati via replaceAllData prima che l'UI venga sbloccata.
      if (cloudSyncHooks.pullOnStart) {
        await Promise.race([
          cloudSyncHooks
            .pullOnStart(loaded)
            .catch((err) => console.warn("Pull iniziale dal cloud non riuscito", err)),
          new Promise<void>((resolve) => setTimeout(resolve, CLOUD_PULL_TIMEOUT_MS)),
        ]);
      }
      set({ hydrated: true });
      schedulePersist(get().data);
    },

    addPerson: ({ name, email, color, isSelf = false }) => {
      const ts = nowIso();
      const used = get().data.people.length;
      const person: Person = {
        id: uuid(),
        name: name.trim(),
        email: email ? normalizeEmail(email) : null,
        color: color ?? PERSON_COLORS[used % PERSON_COLORS.length],
        isSelf,
        archivedAt: null,
        createdAt: ts,
        updatedAt: ts,
      };
      commit((d) => ({ ...d, people: [...d.people, person] }));
      return person;
    },

    updatePerson: (id, patch) => {
      commit((d) => ({
        ...d,
        people: d.people.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: nowIso() } : p)),
      }));
    },

    archivePerson: (id, archived) => {
      commit((d) => ({
        ...d,
        people: d.people.map((p) =>
          p.id === id ? { ...p, archivedAt: archived ? nowIso() : null, updatedAt: nowIso() } : p
        ),
      }));
    },

    deletePerson: (id) => {
      const d = get().data;
      const person = d.people.find((p) => p.id === id);
      if (!person) return { ok: false as const, reason: "Persona non trovata." };
      if (person.isSelf) return { ok: false as const, reason: "Non puoi eliminare te stesso." };
      // Sempre eliminabile: quote e pagamenti ripartiti sui rimanenti, rimborsi rimossi.
      const res = removePersonFromExpenses(d.expenses, d.settlements, id, nowIso());
      const removedIds = new Set(d.expenses.filter((e) => !res.expenses.some((x) => x.id === e.id)).map((e) => e.id));
      // Pulizia dei file allegati delle spese eliminate (fire-and-forget).
      for (const eid of removedIds) {
        const keys = d.attachments.filter((a) => a.expenseId === eid).map((a) => a.storageKey);
        void deleteExpenseAttachmentFiles(eid, keys);
      }
      commit((dd) => ({
        ...dd,
        people: dd.people.filter((p) => p.id !== id),
        groups: dd.groups.map((g) => ({ ...g, memberIds: g.memberIds.filter((m) => m !== id) })),
        expenses: res.expenses,
        settlements: res.settlements,
        attachments: dd.attachments.filter((a) => !removedIds.has(a.expenseId)),
      }));
      return {
        ok: true as const,
        removedExpenses: res.removedExpenses,
        updatedExpenses: res.updatedExpenses,
        removedSettlements: res.removedSettlements,
      };
    },

    addGroup: (input) => {
      const ts = nowIso();
      const group: Group = {
        id: uuid(),
        name: input.name.trim(),
        emoji: input.emoji,
        description: input.description.trim(),
        currency: input.currency,
        memberIds: [...new Set(input.memberIds)],
        archivedAt: null,
        createdAt: ts,
        updatedAt: ts,
      };
      commit((d) => ({ ...d, groups: [group, ...d.groups] }));
      return group;
    },

    updateGroup: (id, patch) => {
      commit((d) => ({
        ...d,
        groups: d.groups.map((g) =>
          g.id === id
            ? {
                ...g,
                ...patch,
                memberIds: patch.memberIds ? [...new Set(patch.memberIds)] : g.memberIds,
                updatedAt: nowIso(),
              }
            : g
        ),
      }));
    },

    archiveGroup: (id, archived) => {
      commit((d) => ({
        ...d,
        groups: d.groups.map((g) =>
          g.id === id ? { ...g, archivedAt: archived ? nowIso() : null, updatedAt: nowIso() } : g
        ),
      }));
    },

    deleteGroup: async (id) => {
      const d = get().data;
      const expenseIds = new Set(d.expenses.filter((e) => e.groupId === id).map((e) => e.id));
      for (const eid of expenseIds) {
        const keys = d.attachments.filter((a) => a.expenseId === eid).map((a) => a.storageKey);
        await deleteExpenseAttachmentFiles(eid, keys);
      }
      commit((dd) => ({
        ...dd,
        groups: dd.groups.filter((g) => g.id !== id),
        expenses: dd.expenses.filter((e) => e.groupId !== id),
        settlements: dd.settlements.filter((s) => s.groupId !== id),
        attachments: dd.attachments.filter((a) => !expenseIds.has(a.expenseId)),
      }));
    },

    addExpense: (input) => {
      const ts = nowIso();
      const expense: Expense = {
        id: uuid(),
        ...input,
        title: input.title.trim(),
        categoryId: input.categoryId || DEFAULT_CATEGORY_ID,
        createdAt: ts,
        updatedAt: ts,
      };
      commit((d) => ({ ...d, expenses: [expense, ...d.expenses] }));
      return expense;
    },

    updateExpense: (id, input) => {
      commit((d) => ({
        ...d,
        expenses: d.expenses.map((e) =>
          e.id === id ? { ...e, ...input, title: input.title.trim(), updatedAt: nowIso() } : e
        ),
      }));
    },

    deleteExpense: async (id) => {
      const d = get().data;
      const keys = d.attachments.filter((a) => a.expenseId === id).map((a) => a.storageKey);
      await deleteExpenseAttachmentFiles(id, keys);
      commit((dd) => ({
        ...dd,
        expenses: dd.expenses.filter((e) => e.id !== id),
        attachments: dd.attachments.filter((a) => a.expenseId !== id),
      }));
    },

    importSplitwiseRows: (groupId, rows, options) => {
      const group = get().data.groups.find((g) => g.id === groupId);
      if (!group) return { ok: false as const, error: "Gruppo non trovato." };
      // Filtro data e conversione valuta: validati PRIMA di scrivere alcunché.
      const applied = applyImportOptions(rows, group.currency, options);
      if (!applied.ok) return applied;
      const rowsToAdd = applied.rows;
      // Risolve un nome CSV in una Person esistente (match case-insensitive,
      // preferendo isSelf) oppure la crea e la aggiunge ai membri del gruppo.
      const idByName = new Map<string, string>();
      const newMemberIds: string[] = [];
      let peopleCreated = 0;
      const resolvePerson = (rawName: string): string => {
        const key = rawName.trim().toLowerCase();
        const cached = idByName.get(key);
        if (cached) return cached;
        const people = get().data.people;
        const existing =
          people.find((p) => p.isSelf && p.name.trim().toLowerCase() === key) ??
          people.find((p) => p.name.trim().toLowerCase() === key);
        let id: string;
        if (existing) {
          id = existing.id;
        } else {
          id = get().addPerson({ name: rawName.trim(), email: null }).id;
          peopleCreated += 1;
        }
        if (!group.memberIds.includes(id) && !newMemberIds.includes(id)) newMemberIds.push(id);
        idByName.set(key, id);
        return id;
      };
      let added = 0;
      for (const row of rowsToAdd) {
        get().addExpense({
          groupId,
          title: row.title,
          notes: "",
          categoryId: categoryIdFor(row.category, row.title),
          date: row.date,
          currency: row.currency,
          amountMinor: row.amountMinor,
          exchangeRate: 1,
          splitMethod: "equal",
          payers: row.payers.map((p) => ({ personId: resolvePerson(p.name), amountMinor: p.amountMinor })),
          splits: row.splits.map((s) => ({ personId: resolvePerson(s.name), amountMinor: s.amountMinor })),
        });
        added += 1;
      }
      if (newMemberIds.length > 0) {
        get().updateGroup(groupId, { memberIds: [...group.memberIds, ...newMemberIds] });
      }
      return { ok: true as const, added, peopleCreated, skippedByDate: applied.skippedByDate };
    },

    deleteExpensesBefore: async (groupId, isoDate) => {
      const d = get().data;
      const doomed = d.expenses.filter((e) => e.groupId === groupId && e.date < isoDate);
      if (doomed.length === 0) return 0;
      const ids = new Set(doomed.map((e) => e.id));
      for (const e of doomed) {
        const keys = d.attachments.filter((a) => a.expenseId === e.id).map((a) => a.storageKey);
        await deleteExpenseAttachmentFiles(e.id, keys);
      }
      commit((dd) => ({
        ...dd,
        expenses: dd.expenses.filter((e) => !ids.has(e.id)),
        attachments: dd.attachments.filter((a) => !ids.has(a.expenseId)),
      }));
      return doomed.length;
    },

    addSettlement: (input) => {
      const settlement: Settlement = { id: uuid(), createdAt: nowIso(), ...input };
      commit((d) => ({ ...d, settlements: [settlement, ...d.settlements] }));
      return settlement;
    },

    deleteSettlement: (id) => {
      commit((d) => ({ ...d, settlements: d.settlements.filter((s) => s.id !== id) }));
    },

    addAttachment: (att) => {
      const attachment: Attachment = { ...att, createdAt: nowIso() };
      commit((d) => ({ ...d, attachments: [...d.attachments, attachment] }));
      return attachment;
    },

    removeAttachment: (id) => {
      commit((d) => ({ ...d, attachments: d.attachments.filter((a) => a.id !== id) }));
    },

    updateSettings: (patch) => {
      commit((d) => {
        const settings = { ...d.settings, ...patch };
        let people = d.people;
        if (patch.ownerName !== undefined) {
          people = d.people.map((p) =>
            p.isSelf ? { ...p, name: patch.ownerName!.trim() || "Io", updatedAt: nowIso() } : p
          );
        }
        return { ...d, settings, people };
      });
    },

    updateTelegramSettings: (patch) => {
      commit((d) => ({
        ...d,
        settings: {
          ...d.settings,
          telegram: {
            enabled: false,
            botToken: "",
            chatId: "",
            ...(d.settings.telegram ?? {}),
            ...patch,
          },
        },
      }));
    },

    updateCloudStorage: (service, patch) => {
      commit((d) => ({
        ...d,
        settings: {
          ...d.settings,
          cloudStorage: {
            ...d.settings.cloudStorage,
            [service]: {
              ...(d.settings.cloudStorage?.[service] ?? { connected: false }),
              ...patch,
            },
          },
        },
      }));
    },

    updateWebdavSettings: (patch) => {
      commit((d) => ({
        ...d,
        settings: {
          ...d.settings,
          webdav: {
            url: "",
            username: "",
            password: "",
            connected: false,
            lastSync: null,
            ...(d.settings.webdav ?? {}),
            ...patch,
          },
        },
      }));
    },

    cacheRate: (from, to, rate) => {
      commit((d) => ({
        ...d,
        settings: {
          ...d.settings,
          rates: {
            ...d.settings.rates,
            [rateKey(from, to)]: { rate, fetchedAt: nowIso() },
            [rateKey(to, from)]: { rate: 1 / rate, fetchedAt: nowIso() },
          },
        },
      }));
    },

    addCloudProject: (input) => {
      const project: CloudProject = {
        id: uuid(),
        label: input.label.trim() || input.config.projectId,
        config: input.config,
        googleClientId: input.googleClientId?.trim() || undefined,
        microsoftClientId: input.microsoftClientId?.trim() || undefined,
        createdAt: nowIso(),
      };
      commit((d) => ({ ...d, settings: { ...d.settings, cloudProjects: [...d.settings.cloudProjects, project] } }));
      return project;
    },

    updateCloudProject: (id, patch) => {
      commit((d) => ({
        ...d,
        settings: {
          ...d.settings,
          cloudProjects: d.settings.cloudProjects.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        },
      }));
    },

    removeCloudProject: (id) => {
      commit((d) => ({
        ...d,
        settings: { ...d.settings, cloudProjects: d.settings.cloudProjects.filter((p) => p.id !== id) },
      }));
    },

    upsertCloudGroupPointer: (group) => {
      commit((d) => ({
        ...d,
        groups: d.groups.some((g) => g.id === group.id)
          ? d.groups.map((g) => (g.id === group.id ? group : g))
          : [group, ...d.groups],
      }));
    },

    applySharedDoc: (groupId, doc) => {
      commit((d) => applySharedDocToData(d, groupId, doc, nowIso()));
    },

    replaceAll: (data) => {
      commit(() => ensureSelf(data));
    },

    replaceAllData: (data) => {
      // A differenza di replaceAll (import manuale), valida e migra il payload
      // remoto prima di committarlo, così un file cloud danneggiato non rompe l'app.
      commit(() => ensureDefaults(migrate(data)));
    },

    resetAll: () => {
      commit(() => ensureSelf(emptyData()));
    },
  };
});
