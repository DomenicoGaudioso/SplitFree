import type { FirebaseWebConfig } from "@/domain/types";

export type InvitePayload = {
  v: 1;
  code: string;
  groupId: string;
  groupName: string;
  emoji: string;
  currency: string;
  config: FirebaseWebConfig;
  googleClientId?: string;
  microsoftClientId?: string;
};

/**
 * Codifica base64url di una stringa Unicode. `btoa`/`atob` sono globali sia
 * su web sia su React Native (polyfill incluso in react-native core) sia in
 * Node (usato nei test): operano su stringhe "binarie", quindi passiamo
 * dall'UTF-8 con l'idioma classico encodeURIComponent/unescape.
 */
export function toBase64Url(text: string): string {
  const binary = unescape(encodeURIComponent(text));
  const b64 = btoa(binary);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(encoded: string): string {
  const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (b64.length % 4)) % 4;
  const binary = atob(b64 + "=".repeat(padLen));
  return decodeURIComponent(escape(binary));
}

/**
 * Codice invito: breve, casuale, è il documento Firestore che le regole
 * verificano per far entrare un membro. Usa `crypto.getRandomValues`
 * (globale su web, React Native e Node) invece di expo-crypto per restare
 * importabile anche dai test, che girano in puro Node senza Metro.
 */
export function newInviteCode(): string {
  const bytes = new Uint8Array(8);
  const g = globalThis as { crypto?: Crypto };
  if (g.crypto?.getRandomValues) {
    g.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function encodeInvite(payload: InvitePayload): string {
  return toBase64Url(JSON.stringify(payload));
}

/** Estrae l'invito da un link "splitfree://join?i=..." o dal solo blocco incollato. */
export function decodeInvite(text: string): InvitePayload | null {
  try {
    const trimmed = text.trim();
    const linkMatch = trimmed.match(/[?&]i=([A-Za-z0-9_-]+)/);
    const blob = linkMatch ? linkMatch[1] : trimmed;
    const json = fromBase64Url(blob);
    const data = JSON.parse(json) as InvitePayload;
    if (data.v !== 1 || !data.code || !data.groupId || !data.config?.projectId || !data.config?.apiKey) return null;
    return data;
  } catch {
    return null;
  }
}

export function buildInviteLink(payload: InvitePayload): string {
  return `splitfree://join?i=${encodeInvite(payload)}`;
}
