import type { CloudStorageService, FileShareProvider, WebDavConfig } from "@/domain/types";

/**
 * Gestione dei token OAuth dei cloud storage (Google Drive / OneDrive).
 *
 * Le funzioni pure (isTokenUsable) non toccano lo store né la rete, così sono
 * testabili in Node; quelle che leggono/aggiornano lo store lo importano in modo
 * lazy (dynamic import) per non trascinare `expo-file-system` nei test e per
 * evitare cicli di import con `src/store/store.ts`.
 *
 * WebDAV non usa OAuth: getWebdavConfig legge le credenziali salvate nelle
 * Impostazioni. Non passa da getValidAccessToken (OAuth-specifico): i punti
 * che chiamano smistano sul provider.
 */

/** Margine di sicurezza: un token che scade entro 60s è considerato già scaduto. */
export const TOKEN_EXPIRY_MARGIN_MS = 60_000;

const PROVIDER_LABEL: Record<FileShareProvider, string> = {
  gdrive: "Google Drive",
  onedrive: "OneDrive",
  webdav: "WebDAV",
  telegram: "Telegram",
};

/**
 * Etichetta leggibile di un provider, per i messaggi in UI.
 */
export function providerLabel(provider: FileShareProvider): string {
  return PROVIDER_LABEL[provider];
}

/** Mappa il provider di condivisione sulla chiave usata in settings.cloudStorage. */
export function cloudStorageKeyFor(provider: FileShareProvider): "googleDrive" | "oneDrive" {
  return provider === "gdrive" ? "googleDrive" : "oneDrive";
}

/**
 * Un token è usabile se esiste e non è (quasi) scaduto:
 * - senza `expiresAt` (flusso implicit legacy) il token si assume valido finché il provider non risponde 401;
 * - con `expiresAt` deve essere nel futuro con almeno 60s di margine.
 */
export function isTokenUsable(
  service: Pick<CloudStorageService, "accessToken" | "expiresAt"> | null | undefined,
  now: number = Date.now()
): boolean {
  if (!service?.accessToken) return false;
  if (!service.expiresAt) return true;
  const expiresAtMs = Date.parse(service.expiresAt);
  if (Number.isNaN(expiresAtMs)) return true;
  return expiresAtMs - TOKEN_EXPIRY_MARGIN_MS > now;
}

/**
 * Chiama il token endpoint del provider con il refresh token e ritorna i nuovi token.
 * Il client ID è quello passato, altrimenti quello salvato sulla connessione.
 */
export async function refreshAccessToken(
  provider: FileShareProvider,
  service: CloudStorageService,
  clientId?: string
): Promise<{ accessToken: string; refreshToken: string | null; expiresAt: string | null }> {
  if (!service.refreshToken) {
    throw new Error(`Nessun refresh token per ${PROVIDER_LABEL[provider]}.`);
  }
  const effectiveClientId = clientId || service.clientId || undefined;
  if (provider === "gdrive") {
    const { refreshGoogleDriveToken } = await import("./googleDriveSync");
    return refreshGoogleDriveToken(service.refreshToken, effectiveClientId);
  }
  const { refreshOneDriveToken } = await import("./oneDriveSync");
  return refreshOneDriveToken(service.refreshToken, effectiveClientId);
}

/**
 * Ritorna un access token valido per il provider:
 * - se quello salvato è ancora valido lo restituisce;
 * - se è scaduto ma c'è un refresh token, lo rinnova e salva i nuovi token nello store;
 * - altrimenti lancia un errore che invita a riconnettere l'account.
 */
export async function getValidAccessToken(provider: FileShareProvider): Promise<string> {
  const { useStore } = await import("@/store/store");
  const state = useStore.getState();
  const key = cloudStorageKeyFor(provider);
  const service = state.data.settings.cloudStorage?.[key];

  if (isTokenUsable(service)) {
    return service!.accessToken!;
  }

  if (service?.refreshToken) {
    const tokens = await refreshAccessToken(provider, service);
    state.updateCloudStorage(key, {
      accessToken: tokens.accessToken,
      // Google può non restituire un nuovo refresh token: tieni il vecchio.
      refreshToken: tokens.refreshToken ?? service.refreshToken,
      expiresAt: tokens.expiresAt,
    });
    return tokens.accessToken;
  }

  throw new Error(`Account ${PROVIDER_LABEL[provider]} scaduto: riconnettilo dalle Impostazioni.`);
}

/**
 * Credenziali WebDAV salvate nelle Impostazioni (nessun OAuth, nessuna scadenza).
 * Lancia se l'account non è collegato: i chiamanti lo traducono in "sola lettura"
 * o in un invito a collegare il server.
 */
export async function getWebdavConfig(): Promise<WebDavConfig> {
  const { useStore } = await import("@/store/store");
  const webdav = useStore.getState().data.settings.webdav;
  if (!webdav?.connected || !webdav.url || !webdav.username || !webdav.password) {
    throw new Error("Collega il tuo cloud WebDAV dalle Impostazioni.");
  }
  return { url: webdav.url, username: webdav.username, password: webdav.password };
}
