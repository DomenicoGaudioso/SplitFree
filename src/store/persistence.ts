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

import { emptyData, migrate } from "./dataDefaults";
export { emptyData, migrate };


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
