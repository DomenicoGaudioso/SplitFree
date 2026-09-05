import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import { DEFAULT_GOOGLE_CLIENT_ID, isPlaceholderClientId } from "./defaultConfig";
import type { AppData } from "@/domain/types";

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_DISCOVERY = {
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
};

const GOOGLE_DRIVE_SCOPES = [
  "openid",
  "profile",
  "email",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.appdata",
];

const BACKUP_FILE_NAME = "splitfree_backup.json";

export type GoogleDriveAccount = {
  email: string;
  name: string;
  accessToken: string;
};

/** Account cloud con token OAuth completo (usato dal nuovo flusso "i tuoi dati nel tuo cloud"). */
export type CloudAccountTokens = {
  email: string;
  name: string;
  accessToken: string;
  /** Presente solo con il flusso auth-code + PKCE (accesso offline); null col flusso implicit. */
  refreshToken: string | null;
  /** ISO di scadenza dell'access token; null se sconosciuta (flusso implicit). */
  expiresAt: string | null;
};

/** Codifica application/x-www-form-urlencoded senza dipendere da URLSearchParams (supporto Hermes parziale). */
function formEncode(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

/**
 * Avvia il login su Google per ottenere l'accesso a Google Drive.
 */
export async function authenticateGoogleDrive(clientId?: string): Promise<GoogleDriveAccount> {
  const effectiveClientId = clientId || DEFAULT_GOOGLE_CLIENT_ID;
  if (!clientId || isPlaceholderClientId(effectiveClientId)) {
    throw new Error(
      "Nessun Client ID valido configurato per Google Cloud Console. Inserisci il tuo Web Client ID personale oppure usa la connessione rapida con la tua email."
    );
  }
  const redirectUri = AuthSession.makeRedirectUri({ scheme: "splitfree" });

  const request = new AuthSession.AuthRequest({
    clientId: effectiveClientId,
    scopes: GOOGLE_DRIVE_SCOPES,
    redirectUri,
    responseType: AuthSession.ResponseType.Token,
    usePKCE: false,
    extraParams: { prompt: "select_account" },
  });

  const result = await request.promptAsync(GOOGLE_DISCOVERY);

  if (result.type !== "success" || !result.params.access_token) {
    throw new Error(result.type === "error" ? result.error?.message ?? "Accesso annullato" : "Accesso a Google Drive annullato");
  }

  const token = result.params.access_token;

  let email = "Utente Google";
  let name = "Account Google";
  try {
    const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (profileRes.ok) {
      const data = await profileRes.json();
      email = data.email || email;
      name = data.name || name;
    }
  } catch (err) {
    console.warn("Impossibile recuperare il profilo Google", err);
  }

  return { email, name, accessToken: token };
}

/** Recupera email e nome dal profilo Google (non bloccante in caso di errore). */
async function fetchGoogleProfile(token: string): Promise<{ email: string; name: string }> {
  let email = "Utente Google";
  let name = "Account Google";
  try {
    const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (profileRes.ok) {
      const data = await profileRes.json();
      email = data.email || email;
      name = data.name || name;
    }
  } catch (err) {
    console.warn("Impossibile recuperare il profilo Google", err);
  }
  return { email, name };
}

/**
 * Connessione completa a Google Drive: Authorization Code + PKCE + `access_type: "offline"`,
 * così il token endpoint restituisce anche un refresh token e l'accesso non scade dopo ~1h.
 *
 * Eccezione web: per i client OAuth di tipo "Web" Google rifiuta lo scambio del code senza
 * client_secret (che un'app distribuita non può custodire). Su web ricadiamo quindi sul
 * flusso implicit una-tantum: access token valido ~1h, nessun refresh token.
 */
export async function connectGoogleDriveAccount(clientId?: string): Promise<CloudAccountTokens> {
  const effectiveClientId = clientId || DEFAULT_GOOGLE_CLIENT_ID;
  if (!clientId || isPlaceholderClientId(effectiveClientId)) {
    throw new Error(
      "Nessun Client ID valido configurato per Google Cloud Console. Configura EXPO_PUBLIC_GOOGLE_CLIENT_ID oppure inserisci il tuo Web Client ID personale."
    );
  }

  if (Platform.OS === "web") {
    const account = await authenticateGoogleDrive(effectiveClientId);
    return { ...account, refreshToken: null, expiresAt: null };
  }

  const redirectUri = AuthSession.makeRedirectUri({ scheme: "splitfree" });

  const request = new AuthSession.AuthRequest({
    clientId: effectiveClientId,
    scopes: GOOGLE_DRIVE_SCOPES,
    redirectUri,
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
    // access_type=offline + prompt=consent: Google emette (e ri-emette) il refresh token.
    extraParams: { access_type: "offline", prompt: "consent" },
  });

  const result = await request.promptAsync(GOOGLE_DISCOVERY);

  if (result.type !== "success" || !result.params.code) {
    throw new Error(result.type === "error" ? result.error?.message ?? "Accesso annullato" : "Accesso a Google Drive annullato");
  }

  const tokenRes = await AuthSession.exchangeCodeAsync(
    {
      clientId: effectiveClientId,
      code: result.params.code,
      redirectUri,
      extraParams: { code_verifier: request.codeVerifier ?? "" },
    },
    GOOGLE_DISCOVERY
  );

  if (!tokenRes.accessToken) {
    throw new Error("Google non ha restituito un access token valido.");
  }

  const expiresAt = tokenRes.expiresIn
    ? new Date(Date.now() + tokenRes.expiresIn * 1000).toISOString()
    : null;
  const { email, name } = await fetchGoogleProfile(tokenRes.accessToken);

  return {
    email,
    name,
    accessToken: tokenRes.accessToken,
    refreshToken: tokenRes.refreshToken ?? null,
    expiresAt,
  };
}

/**
 * Rinnova l'access token Google usando il refresh token (token endpoint, grant refresh_token).
 * Google può non restituire un nuovo refresh token: in tal caso il chiamante deve tenere il vecchio.
 */
export async function refreshGoogleDriveToken(
  refreshToken: string,
  clientId?: string
): Promise<{ accessToken: string; refreshToken: string | null; expiresAt: string | null }> {
  const effectiveClientId = clientId || DEFAULT_GOOGLE_CLIENT_ID;
  const res = await fetch(GOOGLE_DISCOVERY.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formEncode({
      client_id: effectiveClientId,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  const data = await res.json().catch(() => ({} as Record<string, unknown>));
  if (!res.ok || typeof data.access_token !== "string") {
    throw new Error(`Rinnovo del token Google Drive non riuscito (HTTP ${res.status}).`);
  }
  return {
    accessToken: data.access_token,
    refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : null,
    expiresAt:
      typeof data.expires_in === "number"
        ? new Date(Date.now() + data.expires_in * 1000).toISOString()
        : null,
  };
}

/**
 * Cerca se esiste già il file di backup su Google Drive.
 */
async function findExistingBackupId(accessToken: string): Promise<string | null> {
  const query = encodeURIComponent(`name = '${BACKUP_FILE_NAME}' and trashed = false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime)`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) return null;
  const data = await res.json();
  if (Array.isArray(data.files) && data.files.length > 0) {
    return data.files[0].id;
  }
  return null;
}

/**
 * Salva il backup su Google Drive (crea o sovrascrive a nome fisso).
 */
export async function uploadBackupToGoogleDrive(accessToken: string, appData: AppData): Promise<{ success: boolean; timestamp: string }> {
  const jsonContent = JSON.stringify(appData, null, 2);
  const now = new Date().toISOString();
  const existingId = await findExistingBackupId(accessToken);

  if (existingId) {
    // Aggiorna file esistente
    const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=media`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: jsonContent,
    });

    if (!res.ok) {
      throw new Error(`Errore durante l'aggiornamento su Google Drive: ${res.status}`);
    }
  } else {
    // Crea nuovo file con metadata + content tramite multipart
    const boundary = "-------314159265358979323846";
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadata = {
      name: BACKUP_FILE_NAME,
      mimeType: "application/json",
      description: "Backup completo di SplitFree",
    };

    const multipartRequestBody =
      delimiter +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      JSON.stringify(metadata) +
      delimiter +
      "Content-Type: application/json\r\n\r\n" +
      jsonContent +
      closeDelimiter;

    const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: multipartRequestBody,
    });

    if (!res.ok) {
      throw new Error(`Errore durante il salvataggio su Google Drive: ${res.status}`);
    }
  }

  return { success: true, timestamp: now };
}

/**
 * Scarica e ripristina il backup presente su Google Drive.
 */
export async function downloadBackupFromGoogleDrive(accessToken: string): Promise<AppData> {
  const fileId = await findExistingBackupId(accessToken);
  if (!fileId) {
    throw new Error("Nessun file di backup 'splitfree_backup.json' trovato nel tuo Google Drive.");
  }

  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Impossibile scaricare il file da Google Drive (HTTP ${res.status}).`);
  }

  const rawJson = await res.json();
  return rawJson as AppData;
}
