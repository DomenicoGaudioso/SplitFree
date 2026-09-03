import { getFirestore, type Firestore } from "firebase/firestore";
import { firebaseAppFor } from "./firebaseApp";
import type { FirebaseWebConfig } from "@/domain/types";

const instances = new Map<string, Firestore>();

/** Istanza Firestore per un progetto (una per `projectId`). */
export function firestoreFor(config: FirebaseWebConfig): Firestore {
  const app = firebaseAppFor(config);
  const cached = instances.get(app.name);
  if (cached) return cached;
  const db = getFirestore(app);
  instances.set(app.name, db);
  return db;
}
