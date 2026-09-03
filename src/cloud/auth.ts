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

/** Utente autenticato sul progetto, o `null` se non collegato; `undefined` finché non è chiaro. */
export function useCloudAuthUser(config: FirebaseWebConfig | null | undefined): CloudAuthUser | null | undefined {
  const [user, setUser] = useState<CloudAuthUser | null | undefined>(undefined);

  useEffect(() => {
    if (!config) {
      setUser(null);
      return;
    }
    setUser(undefined);
    const auth = authFor(config);
    return onAuthStateChanged(auth, (u) => setUser(u ? toAuthUser(u) : null));
  }, [config?.projectId]);

  return user;
}

export async function signOutOfProject(config: FirebaseWebConfig): Promise<void> {
  await firebaseSignOut(authFor(config));
}

/**
 * Traduce gli errori Firebase Auth comuni in messaggi chiari in italiano.
 */
export function formatAuthError(error: unknown): string {
  const msg = String(error);
  if (msg.includes("auth/invalid-email")) return "L'indirizzo email non è valido.";
  if (msg.includes("auth/user-not-found") || msg.includes("auth/wrong-password") || msg.includes("auth/invalid-credential")) {
    return "Email o password errata.";
  }
  if (msg.includes("auth/email-already-in-use")) return "Questa email è già registrata. Prova ad accedere.";
  if (msg.includes("auth/weak-password")) return "La password deve contenere almeno 6 caratteri.";
  if (msg.includes("auth/too-many-requests")) return "Troppi tentativi falliti. Riprova tra qualche minuto.";
  if (msg.includes("auth/network-request-failed")) return "Errore di connessione. Verifica la tua rete.";
  return msg.replace(/^FirebaseError:\s*/, "");
}

/** Accesso con Email e Password */
export async function signInWithEmail(config: FirebaseWebConfig, email: string, pass: string): Promise<CloudAuthUser> {
  const auth = authFor(config);
  const cred = await FirebaseAuth.signInWithEmailAndPassword(auth, email.trim(), pass);
  return toAuthUser(cred.user);
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
  return toAuthUser(cred.user);
}

/** Accesso rapido come Ospite (anonimo) */
export async function signInAsGuest(config: FirebaseWebConfig, displayName?: string): Promise<CloudAuthUser> {
  const auth = authFor(config);
  const cred = await FirebaseAuth.signInAnonymously(auth);
  if (displayName && displayName.trim()) {
    await FirebaseAuth.updateProfile(cred.user, { displayName: displayName.trim() });
  }
  return toAuthUser(cred.user);
}

/** Reset password via email */
export async function sendPasswordReset(config: FirebaseWebConfig, email: string): Promise<void> {
  const auth = authFor(config);
  await FirebaseAuth.sendPasswordResetEmail(auth, email.trim());
}

