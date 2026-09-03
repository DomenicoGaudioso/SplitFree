import { useState } from "react";
import { Platform } from "react-native";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { GoogleAuthProvider, signInWithCredential, signInWithPopup } from "firebase/auth";
import { authFor, formatAuthError } from "./auth";
import { DEFAULT_GOOGLE_CLIENT_ID } from "./defaultConfig";
import type { FirebaseWebConfig } from "@/domain/types";

WebBrowser.maybeCompleteAuthSession();

export type SignInState = "idle" | "loading" | "error";

export function useGoogleSignIn(config: FirebaseWebConfig | null, clientId: string | null | undefined) {
  const [state, setState] = useState<SignInState>("idle");
  const [error, setError] = useState<string | null>(null);

  const effectiveClientId = clientId || DEFAULT_GOOGLE_CLIENT_ID;

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: effectiveClientId,
    webClientId: effectiveClientId,
    androidClientId: effectiveClientId,
    iosClientId: effectiveClientId,
  });

  async function signIn() {
    if (!config) return;
    setState("loading");
    setError(null);

    // Su Web / Desktop (Electron), signInWithPopup è il metodo più immediato e privo di intoppi
    if (Platform.OS === "web") {
      try {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: "select_account" });
        await signInWithPopup(authFor(config), provider);
        setState("idle");
        return;
      } catch (err) {
        // Se il popup viene bloccato dal browser o annullato dall'utente
        const msg = String(err);
        if (msg.includes("auth/popup-closed-by-user") || msg.includes("auth/cancelled-popup-request")) {
          setState("idle");
          return;
        }
        setError(formatAuthError(err));
        setState("error");
        return;
      }
    }

    // Su Mobile (Android/iOS) tramite AuthSession
    try {
      const result = await promptAsync();
      if (result.type === "success" && result.params.id_token) {
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
      setError(formatAuthError(err));
      setState("error");
    }
  }

  const isAvailable = Platform.OS === "web" || (!!request && !!effectiveClientId);

  return { available: isAvailable, state, error, signIn, response };
}
