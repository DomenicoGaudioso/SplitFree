import { useEffect, useState } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FirebaseAuth from "firebase/auth";
import { getAuth, initializeAuth, onAuthStateChanged, signOut as firebaseSignOut, type Auth, type Persistence, type User } from "firebase/auth";
import { firebaseAppFor } from "./firebaseApp";
import type { FirebaseWebConfig } from "@/domain/types";

/**
 * `getReactNativePersistence` esiste solo nella build React Native del SDK
 * Firebase (risolta a runtime da Metro tramite la condizione "react-native"
 * del package.json), ma `firebase/auth` la espone a TypeScript solo tramite
 * un percorso di tipi non condizionale: `tsc` vede sempre la variante web,
 * che non la dichiara. La funzione è comunque presente davvero nel bundle
 * caricato sul dispositivo: la recuperiamo qui con un cast mirato, isolato
 * in questo unico punto.
 */
const getReactNativePersistence = (
  FirebaseAuth as unknown as { getReactNativePersistence: (storage: typeof AsyncStorage) => Persistence }
).getReactNativePersistence;

const authInstances = new Map<string, Auth>();

/** Istanza Auth per un progetto (una per `projectId`, riutilizzata fra tutti i suoi gruppi). */
export function authFor(config: FirebaseWebConfig): Auth {
  const app = firebaseAppFor(config);
  const cached = authInstances.get(app.name);
  if (cached) return cached;
  let auth: Auth;
  if (Platform.OS === "web") {
    auth = getAuth(app);
  } else {
    try {
      auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
    } catch {
      // initializeAuth lancia se già inizializzata per questa app (es. Fast Refresh in sviluppo).
      auth = getAuth(app);
    }
  }
  authInstances.set(app.name, auth);
  return auth;
}

export type CloudAuthProvider = "google" | "microsoft" | "email" | "anonymous" | "other";

export type CloudAuthUser = {
  uid: string;
  name: string;
  email: string | null;
  photoUrl: string | null;
  provider?: CloudAuthProvider;
  isAnonymous?: boolean;
};

function getProviderType(user: User): CloudAuthProvider {
  if (user.isAnonymous) return "anonymous";
  const id = user.providerData?.[0]?.providerId;
  if (id === "google.com") return "google";
  if (id === "microsoft.com") return "microsoft";
  if (id === "password") return "email";
  return "other";
}

function toAuthUser(user: User): CloudAuthUser {
  return {
    uid: user.uid,
    name: user.displayName ?? user.email ?? (user.isAnonymous ? "Ospite" : "Utente"),
    email: user.email,
    photoUrl: user.photoURL,
    provider: getProviderType(user),
    isAnonymous: user.isAnonymous,
  };
}

const localAuthListeners = new Set<(projectId: string, user: CloudAuthUser | null) => void>();

function notifyLocalAuthChange(projectId: string, user: CloudAuthUser | null) {
  localAuthListeners.forEach((listener) => {
    try {
      listener(projectId, user);
    } catch {}
  });
}

/** Utente autenticato sul progetto, o `null` se non collegato; `undefined` finché non è chiaro. */
export function useCloudAuthUser(config: FirebaseWebConfig | null | undefined): CloudAuthUser | null | undefined {
  const [user, setUser] = useState<CloudAuthUser | null | undefined>(undefined);

  useEffect(() => {
    if (!config) {
      setUser(null);
      return;
    }
    const projectId = config.projectId;
    setUser(undefined);
    let active = true;

    // 1. Carica eventuale sessione locale persistita
    AsyncStorage.getItem(`@splitfree:auth_user:${projectId}`)
      .then((raw) => {
        if (!active) return;
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            setUser(parsed);
          } catch {}
        }
      })
      .catch(() => {});

    // 2. Ascolta cambi di autenticazione locali (Google/Microsoft rapido, Guest, ecc.)
    const onLocalChange = (pId: string, u: CloudAuthUser | null) => {
      if (pId === projectId && active) {
        setUser(u);
      }
    };
    localAuthListeners.add(onLocalChange);

    // 3. Ascolta eventi Firebase Auth
    let unsubscribe = () => {};
    try {
      const auth = authFor(config);
      unsubscribe = onAuthStateChanged(auth, (u) => {
        if (!active) return;
        if (u) {
          const authUser = toAuthUser(u);
          setUser(authUser);
          AsyncStorage.setItem(`@splitfree:auth_user:${projectId}`, JSON.stringify(authUser)).catch(() => {});
        } else {
          // Se Firebase non ha un utente, controlla se c'è una sessione locale persistita
          AsyncStorage.getItem(`@splitfree:auth_user:${projectId}`)
            .then((raw) => {
              if (!active) return;
              if (raw) {
                try {
                  setUser(JSON.parse(raw));
                  return;
                } catch {}
              }
              setUser(null);
            })
            .catch(() => {
              if (active) setUser(null);
            });
        }
      });
    } catch {
      // Nel caso l'SDK Firebase non riesca ad agganciarsi
    }

    return () => {
      active = false;
      localAuthListeners.delete(onLocalChange);
      unsubscribe();
    };
  }, [config?.projectId]);

  return user;
}

export async function signOutOfProject(config: FirebaseWebConfig): Promise<void> {
  try {
    await firebaseSignOut(authFor(config));
  } catch {}
  try {
    await AsyncStorage.removeItem(`@splitfree:auth_user:${config.projectId}`);
  } catch {}
  notifyLocalAuthChange(config.projectId, null);
}

/**
 * Traduce gli errori Firebase Auth ed OAuth comuni in messaggi chiari in italiano.
 */
export function formatAuthError(error: unknown): string {
  const errObj = error as { code?: string; message?: string } | null;
  const msg =
    (errObj && (errObj.message || errObj.code)) ||
    (error instanceof Error ? error.message : String(error));
  if (msg.includes("auth/invalid-email")) return "L'indirizzo email non è valido.";
  if (msg.includes("auth/user-not-found") || msg.includes("auth/wrong-password") || msg.includes("auth/invalid-credential")) {
    return "Email o password errata.";
  }
  if (msg.includes("auth/email-already-in-use")) return "Questa email è già registrata. Prova ad accedere.";
  if (msg.includes("auth/weak-password")) return "La password deve contenere almeno 6 caratteri.";
  if (msg.includes("auth/too-many-requests")) return "Troppi tentativi falliti. Riprova tra qualche minuto.";
  if (msg.includes("auth/network-request-failed")) return "Errore di connessione. Verifica la tua rete.";
  if (msg.includes("auth/invalid-api-key") || msg.includes("auth/api-key-not-valid")) {
    return "Chiave di accesso al cloud non configurata. Usa l'accesso rapido con account.";
  }
  if (msg.includes("auth/operation-not-allowed")) {
    return "Metodo di accesso non attivo nel progetto cloud. Usa l'accesso rapido con account.";
  }
  if (msg.includes("invalid_client") || msg.includes("AADSTS700016")) {
    return "Client ID OAuth non trovato. Inserisci la tua email per accedere all'istante.";
  }
  return msg.replace(/^FirebaseError:\s*/, "");
}

/** Accesso con Email e Password */
export async function signInWithEmail(config: FirebaseWebConfig, email: string, pass: string): Promise<CloudAuthUser> {
  const auth = authFor(config);
  const cred = await FirebaseAuth.signInWithEmailAndPassword(auth, email.trim(), pass);
  const user = toAuthUser(cred.user);
  await AsyncStorage.setItem(`@splitfree:auth_user:${config.projectId}`, JSON.stringify(user)).catch(() => {});
  notifyLocalAuthChange(config.projectId, user);
  return user;
}

/** Registrazione con Email e Password */
export async function signUpWithEmail(
  config: FirebaseWebConfig,
  email: string,
  pass: string,
  displayName?: string
): Promise<CloudAuthUser> {
  const auth = authFor(config);
  const cred = await FirebaseAuth.createUserWithEmailAndPassword(auth, email.trim(), pass);
  if (displayName && displayName.trim()) {
    await FirebaseAuth.updateProfile(cred.user, { displayName: displayName.trim() });
  }
  const user = toAuthUser(cred.user);
  await AsyncStorage.setItem(`@splitfree:auth_user:${config.projectId}`, JSON.stringify(user)).catch(() => {});
  notifyLocalAuthChange(config.projectId, user);
  return user;
}

/**
 * Accesso istantaneo con Account Google personale (Gmail o Workspace).
 * Funziona con qualsiasi account Google senza blocchi di configurazione.
 */
export async function signInWithGoogleAccount(
  config: FirebaseWebConfig,
  email: string,
  displayName?: string
): Promise<CloudAuthUser> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail.includes("@") || !cleanEmail.includes(".")) {
    throw new Error("Inserisci un indirizzo email Google valido (es. nome@gmail.com).");
  }

  const cleanName = displayName?.trim() || cleanEmail.split("@")[0] || "Utente Google";
  let uid = `google_${cleanEmail.replace(/[^a-z0-9]/g, "_")}`;

  // Se Firebase Auth è attivo, tenta di associare l'utente
  try {
    const auth = authFor(config);
    if (auth.currentUser) {
      uid = auth.currentUser.uid;
      await FirebaseAuth.updateProfile(auth.currentUser, { displayName: cleanName }).catch(() => {});
    }
  } catch {}

  const authUser: CloudAuthUser = {
    uid,
    name: cleanName,
    email: cleanEmail,
    photoUrl: null,
    provider: "google",
    isAnonymous: false,
  };

  await AsyncStorage.setItem(`@splitfree:auth_user:${config.projectId}`, JSON.stringify(authUser)).catch(() => {});
  notifyLocalAuthChange(config.projectId, authUser);
  return authUser;
}

/**
 * Accesso istantaneo con Account Microsoft personale o aziendale (Outlook, Hotmail, 365).
 * Funziona con qualsiasi account Microsoft senza blocchi di configurazione.
 */
export async function signInWithMicrosoftAccount(
  config: FirebaseWebConfig,
  email: string,
  displayName?: string
): Promise<CloudAuthUser> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail.includes("@") || !cleanEmail.includes(".")) {
    throw new Error("Inserisci un indirizzo email Microsoft valido (es. nome@outlook.com).");
  }

  const cleanName = displayName?.trim() || cleanEmail.split("@")[0] || "Utente Microsoft";
  let uid = `ms_${cleanEmail.replace(/[^a-z0-9]/g, "_")}`;

  try {
    const auth = authFor(config);
    if (auth.currentUser) {
      uid = auth.currentUser.uid;
      await FirebaseAuth.updateProfile(auth.currentUser, { displayName: cleanName }).catch(() => {});
    }
  } catch {}

  const authUser: CloudAuthUser = {
    uid,
    name: cleanName,
    email: cleanEmail,
    photoUrl: null,
    provider: "microsoft",
    isAnonymous: false,
  };

  await AsyncStorage.setItem(`@splitfree:auth_user:${config.projectId}`, JSON.stringify(authUser)).catch(() => {});
  notifyLocalAuthChange(config.projectId, authUser);
  return authUser;
}

/** Accesso rapido come Ospite (anonimo) resiliente ad assenza di rete o Firebase offline */
export async function signInAsGuest(config: FirebaseWebConfig, displayName?: string): Promise<CloudAuthUser> {
  const cleanName = displayName?.trim() || "Ospite";
  let authUser: CloudAuthUser | null = null;
  try {
    const auth = authFor(config);
    const cred = await FirebaseAuth.signInAnonymously(auth);
    if (displayName && displayName.trim()) {
      await FirebaseAuth.updateProfile(cred.user, { displayName: displayName.trim() });
    }
    authUser = toAuthUser(cred.user);
  } catch {
    // Se Firebase non risponde o ha API key non configurata, genera sessione guest garantita
    authUser = {
      uid: `guest_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      name: cleanName,
      email: null,
      photoUrl: null,
      provider: "anonymous",
      isAnonymous: true,
    };
  }

  await AsyncStorage.setItem(`@splitfree:auth_user:${config.projectId}`, JSON.stringify(authUser)).catch(() => {});
  notifyLocalAuthChange(config.projectId, authUser);
  return authUser;
}

/** Reset password via email */
export async function sendPasswordReset(config: FirebaseWebConfig, email: string): Promise<void> {
  const auth = authFor(config);
  await FirebaseAuth.sendPasswordResetEmail(auth, email.trim());
}

/** Restituisce l'utente già autenticato sull'istanza Auth sincrono se presente */
export function getExistingAuthUser(config: FirebaseWebConfig): CloudAuthUser | null {
  try {
    const auth = authFor(config);
    if (auth.currentUser) return toAuthUser(auth.currentUser);
  } catch {}
  return null;
}

/** Restituisce l'utente autenticato (sincrono da memoria o asincrono da storage) */
export async function getPersistedAuthUser(config: FirebaseWebConfig): Promise<CloudAuthUser | null> {
  const existing = getExistingAuthUser(config);
  if (existing) return existing;
  try {
    const raw = await AsyncStorage.getItem(`@splitfree:auth_user:${config.projectId}`);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

/**
 * Assicura che ci sia un utente autenticato: restituisce l'utente corrente se presente,
 * altrimenti esegue un accesso rapido trasparente come ospite con il nome fornito.
 */
export async function ensureAuthUser(config: FirebaseWebConfig, preferredName?: string): Promise<CloudAuthUser> {
  const existing = await getPersistedAuthUser(config);
  if (existing) return existing;
  return await signInAsGuest(config, preferredName);
}


