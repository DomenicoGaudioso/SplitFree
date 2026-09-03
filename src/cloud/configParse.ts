import type { FirebaseWebConfig } from "@/domain/types";

/**
 * Legge la configurazione incollata dalla console Firebase, sia come snippet
 * JavaScript ("const firebaseConfig = { apiKey: '...', ... }") sia come JSON.
 * Non richiede virgolette rigorose: cerca ogni chiave nota con una regex.
 */
export function parseFirebaseConfigSnippet(text: string): FirebaseWebConfig | null {
  const get = (key: string): string | undefined => {
    const re = new RegExp(`["']?${key}["']?\\s*:\\s*["']([^"']+)["']`);
    return text.match(re)?.[1];
  };
  const apiKey = get("apiKey");
  const authDomain = get("authDomain");
  const projectId = get("projectId");
  const appId = get("appId");
  if (!apiKey || !authDomain || !projectId || !appId) return null;
  return {
    apiKey,
    authDomain,
    projectId,
    appId,
    storageBucket: get("storageBucket"),
    messagingSenderId: get("messagingSenderId"),
  };
}
