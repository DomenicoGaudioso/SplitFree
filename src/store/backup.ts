import { Platform } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import type { AppData } from "@/domain/types";
import { migrate } from "./persistence";

/**
 * Backup manuale: esporta il database come JSON (senza i file allegati) e
 * lo reimporta. Su nativo usa la condivisione di sistema, su web scarica un file.
 */

export type BackupFile = {
  app: "SplitFree";
  exportedAt: string;
  data: AppData;
};

export function buildBackup(data: AppData): BackupFile {
  return { app: "SplitFree", exportedAt: new Date().toISOString(), data };
}

export async function exportBackup(data: AppData): Promise<void> {
  const payload = JSON.stringify(buildBackup(data), null, 2);
  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = `splitfree-backup-${stamp}.json`;
  if (Platform.OS === "web") {
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(payload);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: "application/json", dialogTitle: "Esporta backup SplitFree" });
  }
}

export type ImportResult = { ok: true; data: AppData } | { ok: false; error: string } | { ok: false; canceled: true };

export async function pickBackup(): Promise<ImportResult> {
  const res = await DocumentPicker.getDocumentAsync({
    type: ["application/json", "text/plain", "*/*"],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (res.canceled || !res.assets?.[0]) return { ok: false, canceled: true };
  const asset = res.assets[0];
  try {
    let text: string;
    if (Platform.OS === "web") {
      text = await (await fetch(asset.uri)).text();
    } else {
      text = await new File(asset.uri).text();
    }
    const parsed = JSON.parse(text) as Partial<BackupFile> | AppData;
    const raw = "data" in parsed && parsed.data ? parsed.data : parsed;
    const data = migrate(raw);
    if (!Array.isArray(data.people) || !Array.isArray(data.groups)) {
      return { ok: false, error: "Il file non contiene un backup valido." };
    }
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: `File non leggibile: ${String(err)}` };
  }
}
