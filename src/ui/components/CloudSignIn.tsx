import { Text, View } from "react-native";
import { useGoogleSignIn } from "@/cloud/googleAuth";
import { useMicrosoftSignIn } from "@/cloud/microsoftAuth";
import type { FirebaseWebConfig } from "@/domain/types";
import { font, spacing, useTheme } from "../theme";
import { Button } from "./Button";

type Props = {
  config: FirebaseWebConfig | null;
  googleClientId?: string | null;
  microsoftClientId?: string | null;
  onSignedIn?: () => void;
};

/** Pulsanti "Continua con Google/Microsoft" per un progetto Firebase. */
export function CloudSignInButtons({ config, googleClientId, microsoftClientId, onSignedIn }: Props) {
  const t = useTheme();
  const google = useGoogleSignIn(config, googleClientId);
  const microsoft = useMicrosoftSignIn(config, microsoftClientId);

  const handle = async (fn: () => Promise<void>) => {
    await fn();
    onSignedIn?.();
  };

  return (
    <View>
      <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
        {google.available ? (
          <Button
            title="Continua con Google"
            icon="logo-google"
            variant="secondary"
            onPress={() => void handle(google.signIn)}
            loading={google.state === "loading"}
          />
        ) : null}
        {microsoft.available ? (
          <Button
            title="Continua con Microsoft"
            icon="logo-microsoft"
            variant="secondary"
            onPress={() => void handle(microsoft.signIn)}
            loading={microsoft.state === "loading"}
          />
        ) : null}
      </View>
      {!google.available && !microsoft.available ? (
        <Text style={{ color: t.textFaint, fontSize: font.small, marginTop: spacing.sm }}>
          Nessun metodo di accesso configurato per questo progetto.
        </Text>
      ) : null}
      {google.error ? <Text style={{ color: t.negative, fontSize: font.small, marginTop: spacing.sm }}>{google.error}</Text> : null}
      {microsoft.error ? <Text style={{ color: t.negative, fontSize: font.small, marginTop: spacing.sm }}>{microsoft.error}</Text> : null}
    </View>
  );
}
