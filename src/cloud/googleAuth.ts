import { useState } from "react";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { GoogleAuthProvider, signInWithCredential } from "firebase/auth";
import { authFor } from "./auth";
import type { FirebaseWebConfig } from "@/domain/types";

WebBrowser.maybeCompleteAuthSession();

export type SignInState = "idle" | "loading" | "error";

/**
 * Accesso "Continua con Google" per un progetto Firebase.
 * Serve il Web Client ID OAuth generato da Firebase quando si attiva il
 * provider Google (Authentication → Sign-in method → Google, poi la chiave
 * è nella console di Google Cloud sotto "Credenziali").
 */
// expo-auth-session's Google provider lancia in fase di render se non trova
// ALCUN client id (per qualunque piattaforma): questo valore segnaposto
// evita il crash finché non ne è stato configurato uno vero. `available`
// resta `false` in quel caso, quindi non viene mai usato per un vero accesso.
const NO_CLIENT_ID = "not-configured.apps.googleusercontent.com";

export function useGoogleSignIn(config: FirebaseWebConfig | null, clientId: string | null | undefined) {
  const [state, setState] = useState<SignInState>("idle");
  const [error, setError] = useState<string | null>(null);
  // Il provider Google richiede il client id nel campo specifico della piattaforma
  // corrente (webClientId su web, androidClientId su Android, ecc.): usiamo lo
  // stesso Web Client ID ovunque, com'è tipico per il flusso AuthSession basato
  // su redirect a schema personalizzato invece delle SDK native.
  const effectiveClientId = clientId ?? NO_CLIENT_ID;
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: effectiveClientId,
    webClientId: effectiveClientId,
    androidClientId: effectiveClientId,
    iosClientId: effectiveClientId,
  });

  async function signIn() {
    if (!config || !clientId || !request) return;
    setState("loading");
    setError(null);
    try {
      const result = await promptAsync();
      if (result.type === "success") {
        const idToken = result.params.id_token;
        await signInWithCredential(authFor(config), GoogleAuthProvider.credential(idToken));
        setState("idle");
      } else if (result.type === "error") {
        setError(result.error?.message ?? "Accesso annullato.");
        setState("error");
      } else {
        setState("idle");
      }
    } catch (err) {
      setError(String(err));
      setState("error");
    }
  }

  return { available: !!clientId && !!request, state, error, signIn, response };
}
