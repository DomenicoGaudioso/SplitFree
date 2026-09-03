import { useEffect, useState } from "react";
import { Platform } from "react-native";
import * as AuthSession from "expo-auth-session";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { OAuthProvider, signInWithCredential, signInWithPopup } from "firebase/auth";
import { authFor, formatAuthError } from "./auth";
import { DEFAULT_MICROSOFT_CLIENT_ID, isPlaceholderClientId } from "./defaultConfig";
import type { FirebaseWebConfig } from "@/domain/types";
import type { SignInState } from "./googleAuth";

WebBrowser.maybeCompleteAuthSession();

// Endpoint "common": accetta sia account Microsoft personali (gratuiti) sia
// account aziendali/scolastici, come richiesto ("accesso Microsoft gratuito").
const discovery = {
  authorizationEndpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
  tokenEndpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
};

export function useMicrosoftSignIn(config: FirebaseWebConfig | null, clientId: string | null | undefined) {
  const [state, setState] = useState<SignInState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState<{ raw: string; hashed: string } | null>(null);

  const effectiveClientId = clientId || DEFAULT_MICROSOFT_CLIENT_ID;

  useEffect(() => {
    let active = true;
    const raw = Crypto.randomUUID();
    Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw).then((hashed) => {
      if (active) setNonce({ raw, hashed });
    });
    return () => {
      active = false;
    };
  }, []);

  const redirectUri = AuthSession.makeRedirectUri({ scheme: "splitfree" });
  const [request, , promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: effectiveClientId,
      responseType: AuthSession.ResponseType.IdToken,
      scopes: ["openid", "profile", "email"],
      redirectUri,
      usePKCE: false,
      extraParams: nonce ? { nonce: nonce.hashed, response_mode: "fragment" } : undefined,
    },
    discovery
  );

  async function signIn() {
    if (!config) return;
    setState("loading");
    setError(null);

    if (isPlaceholderClientId(effectiveClientId)) {
      setError(
        "Nessun Application (Client) ID registrato su Microsoft Azure. Usa l'accesso rapido con email Microsoft per entrare subito senza configurazioni."
      );
      setState("error");
      return;
    }

    // Su Web / Desktop (Electron), signInWithPopup è diretto e non dipende da redirect URL
    if (Platform.OS === "web") {
      try {
        const provider = new OAuthProvider("microsoft.com");
        provider.setCustomParameters({ prompt: "select_account" });
        await signInWithPopup(authFor(config), provider);
        setState("idle");
        return;
      } catch (err) {
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

    // Su Mobile via AuthSession
    if (!effectiveClientId || !request || !nonce) return;
    try {
      const result = await promptAsync();
      if (result.type === "success" && result.params.id_token) {
        const provider = new OAuthProvider("microsoft.com");
        const credential = provider.credential({ idToken: result.params.id_token, rawNonce: nonce.raw });
        await signInWithCredential(authFor(config), credential);
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

  const isAvailable = !isPlaceholderClientId(effectiveClientId);

  return { available: isAvailable, state, error, signIn };
}
