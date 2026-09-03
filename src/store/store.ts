import { create } from "zustand";
import type {
  AppData,
  Attachment,
  CloudProject,
  Expense,
  FirebaseWebConfig,
  Group,
  Payment,
  Person,
  Settings,
  Settlement,
  Split,
  SplitMethod,
} from "@/domain/types";
import { DEFAULT_CATEGORY_ID } from "@/domain/categories";
import { deleteExpenseAttachmentFiles } from "./attachments";
import { nowIso, uuid } from "./ids";
import { emptyData, loadData, saveData } from "./persistence";
import { rateKey } from "./rates";

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

  addPerson: (input: { name: string; color?: string; isSelf?: boolean }) => Person;
  updatePerson: (id: string, patch: Partial<Pick<Person, "name" | "color">>) => void;
  archivePerson: (id: string, archived: boolean) => void;
  deletePerson: (id: string) => { ok: boolean; reason?: string };

  addGroup: (input: GroupInput) => Group;
  updateGroup: (id: string, patch: Partial<GroupInput>) => void;
  archiveGroup: (id: string, archived: boolean) => void;
  deleteGroup: (id: string) => Promise<void>;

  addExpense: (input: ExpenseInput) => Expense;
  updateExpense: (id: string, input: ExpenseInput) => void;
  deleteExpense: (id: string) => Promise<void>;

  addSettlement: (input: Omit<Settlement, "id" | "createdAt">) => Settlement;
  deleteSettlement: (id: string) => void;

  addAttachment: (att: Omit<Attachment, "createdAt">) => Attachment;
  removeAttachment: (id: string) => void;

  updateSettings: (patch: Partial<Settings>) => void;
  cacheRate: (from: string, to: string, rate: number) => void;

  addCloudProject: (input: { label: string; config: FirebaseWebConfig; googleClientId?: string; microsoftClientId?: string }) => CloudProject;
  updateCloudProject: (id: string, patch: Partial<Pick<CloudProject, "label" | "googleClientId" | "microsoftClientId">>) => void;
  removeCloudProject: (id: string) => void;

  /** Registra (o aggiorna) localmente un gruppo condiviso: usato dopo la creazione o l'adesione via invito. */
  upsertCloudGroupPointer: (group: Group) => void;

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
    color: PERSON_COLORS[0],
    isSelf: true,
    archivedAt: null,
    createdAt: ts,
    updatedAt: ts,
  };
  return { ...data, people: [self, ...data.people] };
}

export const useStore = create<Store>((set, get) => {
  const commit = (updater: (d: AppData) => AppData) => {
    const next = updater(get().data);
    set({ data: next });
    schedulePersist(next);
    return next;
  };

  return {
    data: emptyData(),
    hydrated: false,

    hydrate: async () => {
      const loaded = ensureSelf(await loadData());
      set({ data: loaded, hydrated: true });
      schedulePersist(loaded);
    },

    addPerson: ({ name, color, isSelf = false }) => {
      const ts = nowIso();
      const used = get().data.people.length;
      const person: Person = {
        id: uuid(),
        name: name.trim(),
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
      if (!person) return { ok: false, reason: "Persona non trovata." };
      if (person.isSelf) return { ok: false, reason: "Non puoi eliminare te stesso." };
      const used =
        d.expenses.some((e) => e.payers.some((p) => p.personId === id) || e.splits.some((s) => s.personId === id)) ||
        d.settlements.some((s) => s.fromPersonId === id || s.toPersonId === id);
      if (used) return { ok: false, reason: "La persona compare in spese o rimborsi: puoi archiviarla." };
      commit((dd) => ({
        ...dd,
        people: dd.people.filter((p) => p.id !== id),
        groups: dd.groups.map((g) => ({ ...g, memberIds: g.memberIds.filter((m) => m !== id) })),
      }));
      return { ok: true };
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

    replaceAll: (data) => {
      commit(() => ensureSelf(data));
    },

    resetAll: () => {
      commit(() => ensureSelf(emptyData()));
    },
  };
});
