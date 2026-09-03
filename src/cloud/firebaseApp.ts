import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import type { FirebaseWebConfig } from "@/domain/types";

/**
 * Un progetto Firebase è di proprietà di UN amministratore (chi lo ha
 * collegato) ma può ospitare più gruppi condivisi: le istanze sono quindi
 * tenute in cache per `projectId`, non per gruppo, così l'accesso fatto per
 * un gruppo vale per tutti i gruppi sullo stesso progetto.
 */
const apps = new Map<string, FirebaseApp>();

export function firebaseAppFor(config: FirebaseWebConfig): FirebaseApp {
  const name = `splitfree-${config.projectId}`;
  const cached = apps.get(name);
  if (cached) return cached;
  const existing = getApps().find((a) => a.name === name);
  const app = existing ?? initializeApp(config, name);
  apps.set(name, app);
  return app;
}
