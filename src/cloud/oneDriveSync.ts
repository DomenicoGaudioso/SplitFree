import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { DEFAULT_MICROSOFT_CLIENT_ID, isPlaceholderClientId } from "./defaultConfig";
import type { AppData } from "@/domain/types";

WebBrowser.maybeCompleteAuthSession();

const ONEDRIVE_DISCOVERY = {
  authorizationEndpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
  tokenEndpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
};

const ONEDRIVE_SCOPES = [
  "openid",
  "profile",
  "email",
  "User.Read",
  "Files.ReadWrite",
  "Files.ReadWrite.AppFolder",
  "offline_access",
];

const BACKUP_FILE_NAME = "splitfree_backup.json";

export type OneDriveAccount = {
  email: string;
  name: string;
  accessToken: string;
};

/** Account cloud con token OAuth completo (usato dal nuovo flusso "i tuoi dati nel tuo cloud"). */
export type CloudAccountTokens = {
  email: string;
  name: string;
  accessToken: string;
  /** Presente solo con il flusso auth-code + PKCE (scope offline_access); null col flusso implicit. */
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
 * Avvia il login interattivo su Microsoft per ottenere l'accesso a OneDrive.
 */
export async function authenticateOneDrive(clientId?: string): Promise<OneDriveAccount> {
  const effectiveClientId = clientId || DEFAULT_MICROSOFT_CLIENT_ID;
  if (!clientId || isPlaceholderClientId(effectiveClientId)) {
    throw new Error(
      "Nessun Application (Client) ID valido registrato su Microsoft Azure. Inserisci il tuo Application ID personale oppure usa la connessione rapida con la tua email."
    );
  }
  const redirectUri = AuthSession.makeRedirectUri({ scheme: "splitfree" });

  const request = new AuthSession.AuthRequest({
    clientId: effectiveClientId,
    scopes: ONEDRIVE_SCOPES,
    redirectUri,
    responseType: AuthSession.ResponseType.Token,
    usePKCE: false,
    extraParams: { prompt: "select_account" },
  });

  const result = await request.promptAsync(ONEDRIVE_DISCOVERY);

  if (result.type !== "success" || !result.params.access_token) {
    throw new Error(result.type === "error" ? result.error?.message ?? "Accesso annullato" : "Accesso a Microsoft OneDrive annullato");
  }

  const token = result.params.access_token;

  // Recupera i dati del profilo Microsoft
  let email = "Utente Microsoft";
  let name = "Account Microsoft";
  try {
    const profileRes = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (profileRes.ok) {
      const data = await profileRes.json();
      email = data.mail || data.userPrincipalName || email;
      name = data.displayName || name;
    }
  } catch (err) {
    console.warn("Impossibile recuperare il profilo Microsoft", err);
  }

  return { email, name, accessToken: token };
}

/** Recupera email e nome dal profilo Microsoft Graph (non bloccante in caso di errore). */
async function fetchMicrosoftProfile(token: string): Promise<{ email: string; name: string }> {
  let email = "Utente Microsoft";
  let name = "Account Microsoft";
  try {
    const profileRes = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (profileRes.ok) {
      const data = await profileRes.json();
      email = data.mail || data.userPrincipalName || email;
      name = data.displayName || name;
    }
  } catch (err) {
    console.warn("Impossibile recuperare il profilo Microsoft", err);
  }
  return { email, name };
}

/**
 * Connessione completa a OneDrive: Authorization Code + PKCE + scope `offline_access`,
 * così il token endpoint Microsoft restituisce anche un refresh token e l'accesso si rinnova da solo.
 * A differenza di Google, il token endpoint Microsoft accetta lo scambio code+PKCE da public client
 * anche su web, quindi il flusso è identico su tutte le piattaforme.
 */
export async function connectOneDriveAccount(clientId?: string): Promise<CloudAccountTokens> {
  const effectiveClientId = clientId || DEFAULT_MICROSOFT_CLIENT_ID;
  if (!clientId || isPlaceholderClientId(effectiveClientId)) {
    throw new Error(
      "Nessun Application (Client) ID valido registrato su Microsoft Azure. Configura EXPO_PUBLIC_MICROSOFT_CLIENT_ID oppure inserisci il tuo Application ID personale."
    );
  }
  const redirectUri = AuthSession.makeRedirectUri({ scheme: "splitfree" });

  const request = new AuthSession.AuthRequest({
    clientId: effectiveClientId,
    scopes: ONEDRIVE_SCOPES,
    redirectUri,
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
    extraParams: { prompt: "select_account" },
  });

  const result = await request.promptAsync(ONEDRIVE_DISCOVERY);

  if (result.type !== "success" || !result.params.code) {
    throw new Error(result.type === "error" ? result.error?.message ?? "Accesso annullato" : "Accesso a Microsoft OneDrive annullato");
  }

  const tokenRes = await AuthSession.exchangeCodeAsync(
    {
      clientId: effectiveClientId,
      code: result.params.code,
      redirectUri,
      extraParams: { code_verifier: request.codeVerifier ?? "" },
    },
    ONEDRIVE_DISCOVERY
  );

  if (!tokenRes.accessToken) {
    throw new Error("Microsoft non ha restituito un access token valido.");
  }

  const expiresAt = tokenRes.expiresIn
    ? new Date(Date.now() + tokenRes.expiresIn * 1000).toISOString()
    : null;
  const { email, name } = await fetchMicrosoftProfile(tokenRes.accessToken);

  return {
    email,
    name,
    accessToken: tokenRes.accessToken,
    refreshToken: tokenRes.refreshToken ?? null,
    expiresAt,
  };
}

/**
 * Rinnova l'access token Microsoft usando il refresh token (grant refresh_token).
 * Microsoft ruota i refresh token: se la risposta ne include uno nuovo va salvato al posto del vecchio.
 */
export async function refreshOneDriveToken(
  refreshToken: string,
  clientId?: string
): Promise<{ accessToken: string; refreshToken: string | null; expiresAt: string | null }> {
  const effectiveClientId = clientId || DEFAULT_MICROSOFT_CLIENT_ID;
  const res = await fetch(ONEDRIVE_DISCOVERY.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formEncode({
      client_id: effectiveClientId,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: ONEDRIVE_SCOPES.join(" "),
    }),
  });
  const data = await res.json().catch(() => ({} as Record<string, unknown>));
  if (!res.ok || typeof data.access_token !== "string") {
    throw new Error(`Rinnovo del token OneDrive non riuscito (HTTP ${res.status}).`);
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
 * Esegue il backup dei dati su Microsoft OneDrive (nella cartella dedicata all'app).
 */
export async function uploadBackupToOneDrive(accessToken: string, appData: AppData): Promise<{ success: boolean; timestamp: string }> {
  const jsonContent = JSON.stringify(appData, null, 2);
  const now = new Date().toISOString();

  // Carica il file nella cartella approot o SplitFree
  const uploadUrl = `https://graph.microsoft.com/v1.0/me/drive/special/approot:/${BACKUP_FILE_NAME}:/content`;
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: jsonContent,
  });

  if (!res.ok) {
    // Fallback: prova nella root di OneDrive (/SplitFree/splitfree_backup.json)
    const fallbackUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/SplitFree/${BACKUP_FILE_NAME}:/content`;
    const fallbackRes = await fetch(fallbackUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: jsonContent,
    });

    if (!fallbackRes.ok) {
      const errText = await fallbackRes.text().catch(() => "");
      throw new Error(`Errore durante il salvataggio su OneDrive: ${fallbackRes.status} ${errText}`);
    }
  }

  return { success: true, timestamp: now };
}

/**
 * Scarica e ripristina l'ultimo backup presente su Microsoft OneDrive.
 */
export async function downloadBackupFromOneDrive(accessToken: string): Promise<AppData> {
  // Prova prima in approot
  let downloadUrl = `https://graph.microsoft.com/v1.0/me/drive/special/approot:/${BACKUP_FILE_NAME}:/content`;
  let res = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    // Prova nella cartella SplitFree
    downloadUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/SplitFree/${BACKUP_FILE_NAME}:/content`;
    res = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error("Nessun backup di SplitFree trovato su Microsoft OneDrive.");
    }
    throw new Error(`Impossibile scaricare il backup da OneDrive (HTTP ${res.status}).`);
  }

  const rawJson = await res.json();
  return rawJson as AppData;
}
