import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { DEFAULT_GOOGLE_CLIENT_ID } from "./defaultConfig";
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
];

const BACKUP_FILE_NAME = "splitfree_backup.json";

export type GoogleDriveAccount = {
  email: string;
  name: string;
  accessToken: string;
};

/**
 * Avvia il login su Google per ottenere l'accesso a Google Drive.
 */
export async function authenticateGoogleDrive(clientId?: string): Promise<GoogleDriveAccount> {
  const effectiveClientId = clientId || DEFAULT_GOOGLE_CLIENT_ID;
  if (!clientId && effectiveClientId === DEFAULT_GOOGLE_CLIENT_ID) {
    throw new Error(
      "Nessun Client ID personale configurato per Google Cloud. Inserisci il tuo Web Client ID nelle opzioni avanzate oppure usa la connessione rapida con la tua email."
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
