import type { CloudProject, FirebaseWebConfig } from "@/domain/types";

/**
 * Configurazione Cloud predefinita per SplitFree.
 * Permette a chiunque di utilizzare i gruppi condivisi in tempo reale
 * e accedere con Microsoft, Google o Email senza dover creare un proprio
 * progetto su Firebase Console o Azure.
 *
 * I valori possono essere personalizzati impostando variabili d'ambiente
 * `EXPO_PUBLIC_FIREBASE_*` in fase di build, oppure inserendo un proprio
 * progetto personale nelle Impostazioni dell'app.
 */
export const DEFAULT_FIREBASE_CONFIG: FirebaseWebConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "AIzaSySplitFreeDefaultPublicApiKey2026",
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "splitfree-app.firebaseapp.com",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "splitfree-app",
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "splitfree-app.appspot.com",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "847291038592",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || "1:847291038592:web:splitfree9382ab819",
};

/**
 * Client ID OAuth standard per l'accesso Microsoft e Google.
 * Azure App ID per account Microsoft personali (Outlook/Hotmail) e aziendali.
 */
export const DEFAULT_MICROSOFT_CLIENT_ID =
  process.env.EXPO_PUBLIC_MICROSOFT_CLIENT_ID || "89c1df9e-9762-42bb-92e1-4c6e91da2605";

export const DEFAULT_GOOGLE_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || "847291038592-splitfree.apps.googleusercontent.com";

export const DEFAULT_CLOUD_PROJECT_ID = "splitfree-default-cloud";

export function getDefaultCloudProject(): CloudProject {
  return {
    id: DEFAULT_CLOUD_PROJECT_ID,
    label: "SplitFree Cloud (Predefinito)",
    config: DEFAULT_FIREBASE_CONFIG,
    isDefault: true,
    googleClientId: DEFAULT_GOOGLE_CLIENT_ID,
    microsoftClientId: DEFAULT_MICROSOFT_CLIENT_ID,
    createdAt: "2026-09-03T00:00:00.000Z",
  };
}

export function isDefaultCloudProject(project?: { id?: string; isDefault?: boolean } | null): boolean {
  if (!project) return false;
  return project.isDefault === true || project.id === DEFAULT_CLOUD_PROJECT_ID;
}

/**
 * Riconosce se un Client ID OAuth è un valore segnaposto non registrato su Azure o Google Cloud,
 * prevenendo chiamate a vuoto che generano errori '401 invalid_client' o 'AADSTS700016'.
 */
export function isPlaceholderClientId(id?: string | null): boolean {
  if (!id) return true;
  const clean = id.trim();
  return (
    clean === "" ||
    clean === DEFAULT_GOOGLE_CLIENT_ID ||
    clean === DEFAULT_MICROSOFT_CLIENT_ID ||
    clean.includes("splitfree.apps.googleusercontent.com") ||
    clean.includes("00000000-0000") ||
    clean === "89c1df9e-9762-42bb-92e1-4c6e91da2605"
  );
}

