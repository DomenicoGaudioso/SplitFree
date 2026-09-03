import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { formatAuthError, signInAsGuest } from "@/cloud/auth";
import { useGoogleSignIn } from "@/cloud/googleAuth";
import { useMicrosoftSignIn } from "@/cloud/microsoftAuth";
import type { FirebaseWebConfig } from "@/domain/types";
import { useStore } from "@/store/store";
import { font, spacing, useTheme } from "../theme";
import { Button } from "./Button";
import { EmailAuthModal } from "./EmailAuthModal";
import { SocialAuthModal } from "./SocialAuthModal";

type Props = {
  config: FirebaseWebConfig | null;
  googleClientId?: string | null;
  microsoftClientId?: string | null;
  onSignedIn?: () => void;
  compact?: boolean;
};

/** Pulsanti di accesso per il Cloud: Google, Microsoft, Email ed Ospite. */
export function CloudSignInButtons({
  config,
  googleClientId,
  microsoftClientId,
  onSignedIn,
  compact = false,
}: Props) {
  const t = useTheme();
  const settings = useStore((s) => s.data.settings);
  const google = useGoogleSignIn(config, googleClientId);
  const microsoft = useMicrosoftSignIn(config, microsoftClientId);

  const [googleModalVisible, setGoogleModalVisible] = useState(false);
  const [microsoftModalVisible, setMicrosoftModalVisible] = useState(false);
  const [emailModalVisible, setEmailModalVisible] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [guestError, setGuestError] = useState<string | null>(null);

  const handleGuestSignIn = async () => {
    if (!config) return;
    setGuestLoading(true);
    setGuestError(null);
    try {
      await signInAsGuest(config, settings.ownerName || "Ospite");
      onSignedIn?.();
    } catch (err) {
      setGuestError(formatAuthError(err));
    } finally {
      setGuestLoading(false);
    }
  };

  if (!config) {
    return (
      <Text style={{ color: t.textFaint, fontSize: font.small }}>
        Configurazione cloud non disponibile.
      </Text>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.buttonsRow, compact && styles.compactRow]}>
        {/* Accedi con Google */}
        <Button
          title="Google"
          icon="logo-google"
          variant="secondary"
          size={compact ? "sm" : "md"}
          onPress={() => setGoogleModalVisible(true)}
          style={compact ? styles.compactBtn : styles.btn}
        />

        {/* Accedi con Microsoft */}
        <Button
          title="Microsoft"
          icon="logo-microsoft"
          variant="secondary"
          size={compact ? "sm" : "md"}
          onPress={() => setMicrosoftModalVisible(true)}
          style={compact ? styles.compactBtn : styles.btn}
        />

        {/* Accedi con Email */}
        <Button
          title="Email"
          icon="mail-outline"
          variant="secondary"
          size={compact ? "sm" : "md"}
          onPress={() => setEmailModalVisible(true)}
          style={compact ? styles.compactBtn : styles.btn}
        />

        {/* Continua come Ospite */}
        <Button
          title="Ospite"
          icon="person-outline"
          variant="ghost"
          size={compact ? "sm" : "md"}
          onPress={() => void handleGuestSignIn()}
          loading={guestLoading}
          style={compact ? styles.compactBtn : styles.btn}
        />
      </View>

      {/* Messaggi di errore */}
      {google.error ? (
        <Text style={[styles.errorText, { color: t.negative }]}>{google.error}</Text>
      ) : null}
      {microsoft.error ? (
        <Text style={[styles.errorText, { color: t.negative }]}>{microsoft.error}</Text>
      ) : null}
      {guestError ? (
        <Text style={[styles.errorText, { color: t.negative }]}>{guestError}</Text>
      ) : null}

      {/* Modal Google */}
      <SocialAuthModal
        visible={googleModalVisible}
        provider="google"
        config={config}
        initialEmail={settings.cloudStorage?.googleDrive?.userEmail || ""}
        initialName={settings.ownerName || ""}
        onClose={() => setGoogleModalVisible(false)}
        onSuccess={() => onSignedIn?.()}
        onTrySso={google.available ? google.signIn : undefined}
        ssoLoading={google.state === "loading"}
      />

      {/* Modal Microsoft */}
      <SocialAuthModal
        visible={microsoftModalVisible}
        provider="microsoft"
        config={config}
        initialEmail={settings.cloudStorage?.oneDrive?.userEmail || ""}
        initialName={settings.ownerName || ""}
        onClose={() => setMicrosoftModalVisible(false)}
        onSuccess={() => onSignedIn?.()}
        onTrySso={microsoft.available ? microsoft.signIn : undefined}
        ssoLoading={microsoft.state === "loading"}
      />

      {/* Modal Email */}
      <EmailAuthModal
        visible={emailModalVisible}
        config={config}
        onClose={() => setEmailModalVisible(false)}
        onSuccess={() => onSignedIn?.()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  buttonsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap",
    alignItems: "center",
  },
  compactRow: {
    gap: 6,
  },
  btn: {
    flexGrow: 1,
    minWidth: 110,
  },
  compactBtn: {
    paddingHorizontal: spacing.sm,
  },
  errorText: {
    fontSize: font.small,
    marginTop: spacing.sm,
  },
});
