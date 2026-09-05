import { DATA_VERSION, type AppData } from "@/domain/types";

/** Crea la struttura dati iniziale vuota con supporto a Cloud Storage (Regola Studio #9). */
export function emptyData(): AppData {
  return {
    version: DATA_VERSION,
    people: [],
    groups: [],
    expenses: [],
    settlements: [],
    attachments: [],
    settings: {
      ownerName: "",
      defaultCurrency: "EUR",
      theme: "system",
      rates: {},
      cloudProjects: [],
      cloudStorage: {
        oneDrive: { connected: false },
        googleDrive: { connected: false },
      },
      webdav: { url: "", username: "", password: "", connected: false, lastSync: null },
      onboardingSkipped: false,
      telegram: { enabled: false, botToken: "", chatId: "" },
    },
  };
}

/** Normalizza dati letti da disco (versioni precedenti, campi mancanti). */
export function migrate(raw: unknown): AppData {
  const base = emptyData();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<AppData>;
  return {
    version: DATA_VERSION,
    people: Array.isArray(r.people) ? r.people.map((p) => ({ ...p, email: p.email ?? null })) : [],
    groups: Array.isArray(r.groups)
      ? r.groups.map((g) => ({
          ...g,
          emoji: g.emoji ?? "",
          description: g.description ?? "",
          memberIds: g.memberIds ?? [],
          cloud: g.cloud ?? null,
        }))
      : [],
    expenses: Array.isArray(r.expenses)
      ? r.expenses.map((e) => ({
          ...e,
          notes: e.notes ?? "",
          exchangeRate: e.exchangeRate ?? 1,
          payers: e.payers ?? [],
          splits: e.splits ?? [],
        }))
      : [],
    settlements: Array.isArray(r.settlements) ? r.settlements : [],
    attachments: Array.isArray(r.attachments) ? r.attachments : [],
    settings: {
      ...base.settings,
      ...(r.settings ?? {}),
      rates: r.settings?.rates ?? {},
      cloudProjects: Array.isArray(r.settings?.cloudProjects) ? r.settings.cloudProjects : [],
      cloudStorage: {
        oneDrive: { connected: false, ...(r.settings?.cloudStorage?.oneDrive ?? {}) },
        googleDrive: { connected: false, ...(r.settings?.cloudStorage?.googleDrive ?? {}) },
      },
      webdav: {
        url: "",
        username: "",
        password: "",
        connected: false,
        lastSync: null,
        ...(r.settings?.webdav ?? {}),
      },
      telegram: {
        enabled: false,
        botToken: "",
        chatId: "",
        ...(r.settings?.telegram ?? {}),
      },
    },
  };
}
