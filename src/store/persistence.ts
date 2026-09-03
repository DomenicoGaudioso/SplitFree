import { Platform } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import { DATA_VERSION, type AppData } from "@/domain/types";

/**
 * Persistenza del database dell'app.
 * - Android/iOS: un unico file JSON nella cartella privata dell'app
 *   (scrittura atomica: file temporaneo + rinomina).
 * - Web / desktop (Electron): localStorage.
 *
 * Il database è piccolo (migliaia di spese al massimo) e viene tenuto in
 * memoria: ogni modifica riscrive il file con un debounce.
 */

const FILE_NAME = "splitfree-data.json";
const WEB_KEY = "splitfree:data:v1";

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
    people: Array.isArray(r.people) ? r.people : [],
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
      cloudProjects: r.settings?.cloudProjects ?? [],
    },
  };
}

function dataFile(): File {
  return new File(Paths.document, FILE_NAME);
}

export async function loadData(): Promise<AppData> {
  if (Platform.OS === "web") {
    try {
      const raw = globalThis.localStorage?.getItem(WEB_KEY);
      return raw ? migrate(JSON.parse(raw)) : emptyData();
    } catch (err) {
      console.warn("loadData(web) failed", err);
      return emptyData();
    }
  }
  try {
    const file = dataFile();
    if (!file.exists) return emptyData();
    const text = await file.text();
    return migrate(JSON.parse(text));
  } catch (err) {
    console.warn("loadData(native) failed", err);
    return emptyData();
  }
}

let writeChain: Promise<void> = Promise.resolve();

export function saveData(data: AppData): Promise<void> {
  const json = JSON.stringify(data);
  writeChain = writeChain.then(async () => {
    if (Platform.OS === "web") {
      globalThis.localStorage?.setItem(WEB_KEY, json);
      return;
    }
    const dir = new Directory(Paths.document);
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const tmp = new File(Paths.document, `${FILE_NAME}.tmp`);
    if (tmp.exists) tmp.delete();
    tmp.create();
    tmp.write(json);
    const target = dataFile();
    if (target.exists) target.delete();
    tmp.move(target);
  });
  return writeChain.catch((err) => {
    console.error("saveData failed", err);
  });
}

/** Attende il completamento delle scritture in coda (usato prima di export/import). */
export function flushWrites(): Promise<void> {
  return writeChain;
}
