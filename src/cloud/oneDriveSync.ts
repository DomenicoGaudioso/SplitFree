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
];

const BACKUP_FILE_NAME = "splitfree_backup.json";

export type OneDriveAccount = {
  email: string;
  name: string;
  accessToken: string;
};

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
