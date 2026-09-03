import { useEffect, useState } from "react";
import * as AuthSession from "expo-auth-session";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { OAuthProvider, signInWithCredential } from "firebase/auth";
import { authFor } from "./auth";
import type { FirebaseWebConfig } from "@/domain/types";
import type { SignInState } from "./googleAuth";

WebBrowser.maybeCompleteAuthSession();

// Endpoint "common": accetta sia account Microsoft personali (gratuiti) sia
// account aziendali/scolastici, come richiesto ("accesso Microsoft gratuito").
const discovery = {
  authorizationEndpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
  tokenEndpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
};

/**
 * Accesso "Continua con Microsoft" per un progetto Firebase.
 * Richiede una App registration gratuita su Azure (Microsoft Entra ID →
 * App registrations, "Account personali Microsoft e account aziendali/
 * dell'istituzione"), collegata in Firebase come provider OIDC `microsoft.com`
 * con lo stesso Application (client) ID.
 */
export function useMicrosoftSignIn(config: FirebaseWebConfig | null, clientId: string | null | undefined) {
  const [state, setState] = useState<SignInState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState<{ raw: string; hashed: string } | null>(null);

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
      clientId: clientId ?? "",
      responseType: AuthSession.ResponseType.IdToken,
      scopes: ["openid", "profile", "email"],
      redirectUri,
      usePKCE: false,
      extraParams: nonce ? { nonce: nonce.hashed, response_mode: "fragment" } : undefined,
    },
    discovery
  );

  async function signIn() {
    if (!config || !clientId || !request || !nonce) return;
    setState("loading");
    setError(null);
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
      setError(String(err));
      setState("error");
    }
  }

  return { available: !!clientId && !!request && !!nonce, state, error, signIn };
}
