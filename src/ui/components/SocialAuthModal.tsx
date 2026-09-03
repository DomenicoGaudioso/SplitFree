import { useEffect, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatAuthError, signInWithGoogleAccount, signInWithMicrosoftAccount } from "@/cloud/auth";
import type { FirebaseWebConfig } from "@/domain/types";
import { font, radius, spacing, useTheme } from "../theme";
import { Button } from "./Button";
import { TextField } from "./TextField";

type Props = {
  visible: boolean;
  provider: "google" | "microsoft";
  config: FirebaseWebConfig;
  initialEmail?: string;
  initialName?: string;
  onClose: () => void;
  onSuccess?: () => void;
  onTrySso?: () => Promise<void>;
  ssoLoading?: boolean;
};

export function SocialAuthModal({
  visible,
  provider,
  config,
  initialEmail = "",
  initialName = "",
  onClose,
  onSuccess,
  onTrySso,
  ssoLoading = false,
}: Props) {
  const t = useTheme();
  const [email, setEmail] = useState(initialEmail);
  const [name, setName] = useState(initialName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isGoogle = provider === "google";
  const providerLabel = isGoogle ? "Google" : "Microsoft";
  const defaultPlaceholder = isGoogle ? "tuonome@gmail.com" : "tuonome@outlook.com";
  const iconName = isGoogle ? "logo-google" : "logo-microsoft";
  const brandColor = isGoogle ? "#EA4335" : "#00A4EF";

  useEffect(() => {
    if (visible) {
      if (initialEmail && !email) setEmail(initialEmail);
      if (initialName && !name) setName(initialName);
      setError(null);
      setLoading(false);
    }
  }, [visible, initialEmail, initialName]);

  function handleClose() {
    setError(null);
    setLoading(false);
    onClose();
  }

  async function handleSubmit() {
    setError(null);
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      setError(`Inserisci il tuo indirizzo email ${providerLabel}.`);
      return;
    }
    if (!cleanEmail.includes("@") || !cleanEmail.includes(".")) {
      setError("Inserisci un indirizzo email valido (es. " + defaultPlaceholder + ").");
      return;
    }

    setLoading(true);
    try {
      if (isGoogle) {
        await signInWithGoogleAccount(config, cleanEmail, name);
      } else {
        await signInWithMicrosoftAccount(config, cleanEmail, name);
      }
      onSuccess?.();
      handleClose();
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleSso() {
    if (!onTrySso) return;
    setError(null);
    try {
      await onTrySso();
      onSuccess?.();
      handleClose();
    } catch (err) {
      setError(formatAuthError(err));
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <Pressable
          style={[
            styles.sheet,
            { backgroundColor: t.surface, borderColor: t.border },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Header con icona e brand */}
            <View style={styles.header}>
              <View style={[styles.brandIconBox, { backgroundColor: brandColor + "18" }]}>
                <Ionicons name={iconName} size={28} color={brandColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: t.text }]}>
                  Accedi con {providerLabel}
                </Text>
                <Text style={[styles.subtitle, { color: t.textMuted }]}>
                  {isGoogle
                    ? "Inserisci il tuo account Google (Gmail o Workspace) per entrare subito ed essere riconosciuto nei gruppi."
                    : "Inserisci il tuo account Microsoft (Outlook, Hotmail o 365) per entrare subito ed essere riconosciuto nei gruppi."}
                </Text>
              </View>
            </View>

            {/* Form */}
            <View style={styles.form}>
              <TextField
                label={`Email ${providerLabel}`}
                value={email}
                onChangeText={setEmail}
                placeholder={defaultPlaceholder}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />

              <TextField
                label="Il tuo nome visualizzato"
                value={name}
                onChangeText={setName}
                placeholder="Es. Mario Rossi"
                autoCapitalize="words"
              />

              {error ? (
                <Text style={[styles.errorText, { color: t.negative }]}>
                  {error}
                </Text>
              ) : null}

              {/* Pulsante primario di accesso garantito */}
              <Button
                title={loading ? "Accesso in corso…" : `Continua con ${providerLabel}`}
                icon={iconName}
                size="lg"
                onPress={handleSubmit}
                loading={loading}
                style={[styles.primaryBtn, { backgroundColor: brandColor }]}
              />

              {/* Opzione SSO interattivo se disponibile */}
              {onTrySso ? (
                <View style={styles.ssoSection}>
                  <View style={styles.dividerRow}>
                    <View style={[styles.dividerLine, { backgroundColor: t.border }]} />
                    <Text style={[styles.dividerText, { color: t.textFaint }]}>oppure</Text>
                    <View style={[styles.dividerLine, { backgroundColor: t.border }]} />
                  </View>
                  <Button
                    title="Accedi via Popup SSO del Browser"
                    size="sm"
                    variant="ghost"
                    onPress={handleSso}
                    loading={ssoLoading}
                  />
                </View>
              ) : null}

              <Button
                title="Annulla"
                variant="ghost"
                size="md"
                onPress={handleClose}
                style={{ marginTop: spacing.xs }}
              />
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.md,
  },
  sheet: {
    width: "100%",
    maxWidth: 440,
    borderRadius: radius.lg,
    borderWidth: 1,
    maxHeight: "90%",
    ...Platform.select({
      web: { boxShadow: "0 8px 30px rgba(0,0,0,0.22)" },
      default: { elevation: 8 },
    }),
  },
  scrollContent: {
    padding: spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  brandIconBox: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: font.h2,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: font.small,
    lineHeight: 18,
    marginTop: 2,
  },
  form: {
    gap: spacing.md,
  },
  errorText: {
    fontSize: font.small,
    lineHeight: 18,
  },
  primaryBtn: {
    marginTop: spacing.xs,
  },
  ssoSection: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginVertical: 4,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: font.tiny,
    textTransform: "uppercase",
  },
});
