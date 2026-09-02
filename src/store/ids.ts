import * as Crypto from "expo-crypto";

export function uuid(): string {
  try {
    return Crypto.randomUUID();
  } catch {
    // Fallback (web senza crypto sicuro): non è critico per la sicurezza.
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}
