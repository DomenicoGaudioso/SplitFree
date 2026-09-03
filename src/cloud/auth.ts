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

export type CloudAuthUser = {
  uid: string;
  name: string;
  email: string | null;
  photoUrl: string | null;
};

function toAuthUser(user: User): CloudAuthUser {
  return {
    uid: user.uid,
    name: user.displayName ?? user.email ?? "Utente",
    email: user.email,
    photoUrl: user.photoURL,
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
