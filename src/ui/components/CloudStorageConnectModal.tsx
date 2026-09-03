import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { authenticateGoogleDrive } from "@/cloud/googleDriveSync";
import { authenticateOneDrive } from "@/cloud/oneDriveSync";
import { font, radius, spacing, useTheme } from "../theme";
import { Button } from "./Button";
import { TextField } from "./TextField";

type Props = {
  visible: boolean;
  service: "oneDrive" | "googleDrive";
  initialEmail?: string;
  initialName?: string;
  initialClientId?: string;
  onClose: () => void;
  onConnect: (account: {
    email: string;
    name?: string;
    clientId?: string;
    accessToken?: string;
  }) => void;
};

export function CloudStorageConnectModal({
  visible,
  service,
  initialEmail = "",
  initialName = "",
  initialClientId = "",
  onClose,
  onConnect,
}: Props) {
  const t = useTheme();
  const [email, setEmail] = useState(initialEmail);
  const [name, setName] = useState(initialName);
  const [clientId, setClientId] = useState(initialClientId);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loadingOAuth, setLoadingOAuth] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isGoogle = service === "googleDrive";
  const brandTitle = isGoogle ? "Google Drive" : "Microsoft OneDrive";
  const brandIcon = isGoogle ? "logo-google" : "logo-microsoft";
  const brandColor = isGoogle ? "#EA4335" : "#00A4EF";
  const defaultPlaceholder = isGoogle ? "tuonome@gmail.com" : "tuonome@outlook.com";

  useEffect(() => {
    if (visible) {
      if (initialEmail && !email) setEmail(initialEmail);
      if (initialName && !name) setName(initialName);
      if (initialClientId && !clientId) setClientId(initialClientId);
      setError(null);
      setLoadingOAuth(false);
    }
  }, [visible, initialEmail, initialName, initialClientId]);

  function handleClose() {
    setError(null);
    setLoadingOAuth(false);
    onClose();
  }

  function handleDirectConnect() {
    setError(null);
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError(`Inserisci il tuo indirizzo email ${isGoogle ? "Google" : "Microsoft"}.`);
      return;
    }
    if (!cleanEmail.includes("@") || !cleanEmail.includes(".")) {
      setError(`Inserisci un indirizzo email valido (es. ${defaultPlaceholder}).`);
      return;
    }

    onConnect({
      email: cleanEmail,
      name: name.trim() || undefined,
      clientId: clientId.trim() || undefined,
    });
    handleClose();
  }

  async function handleOAuthConnect() {
    setError(null);
    setLoadingOAuth(true);
    try {
      if (isGoogle) {
        const res = await authenticateGoogleDrive(clientId.trim() || undefined);
        onConnect({
          email: res.email,
          name: res.name,
          accessToken: res.accessToken,
          clientId: clientId.trim() || undefined,
        });
      } else {
        const res = await authenticateOneDrive(clientId.trim() || undefined);
        onConnect({
          email: res.email,
          name: res.name,
          accessToken: res.accessToken,
          clientId: clientId.trim() || undefined,
        });
      }
      handleClose();
    } catch (err) {
      const msg = String(err).replace(/^Error:\s*/, "");
      setError(msg || "Autenticazione OAuth non riuscita. Puoi usare la connessione rapida sopra.");
    } finally {
      setLoadingOAuth(false);
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
          style={[styles.sheet, { backgroundColor: t.surface, borderColor: t.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            {/* Header */}
            <View style={styles.header}>
              <View style={[styles.brandIconBox, { backgroundColor: brandColor + "18" }]}>
                <Ionicons name={brandIcon} size={28} color={brandColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: t.text }]}>
                  Connetti {brandTitle}
                </Text>
                <Text style={[styles.subtitle, { color: t.textMuted }]}>
                  {isGoogle
                    ? "Collega il tuo account Google personale per abilitare salvataggio e ripristino di backup su Drive."
                    : "Collega il tuo account Microsoft personale per abilitare salvataggio e ripristino di backup su OneDrive."}
                </Text>
              </View>
            </View>

            {/* Sezione 1: Accesso Rapido (1 Click) */}
            <View style={styles.section}>
              <TextField
                label={`Indirizzo email ${isGoogle ? "Google" : "Microsoft"}`}
                value={email}
                onChangeText={setEmail}
                placeholder={defaultPlaceholder}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />

              <TextField
                label="Il tuo nome (opzionale)"
                value={name}
                onChangeText={setName}
                placeholder="Es. Mario Rossi"
                autoCapitalize="words"
              />

              {error ? (
                <Text style={[styles.errorText, { color: t.negative }]}>{error}</Text>
              ) : null}

              <Button
                title={`Collega ${brandTitle}`}
                icon={brandIcon}
                size="lg"
                onPress={handleDirectConnect}
                style={[styles.primaryBtn, { backgroundColor: brandColor }]}
              />
            </View>

            {/* Sezione 2: Avanzate OAuth */}
            <View style={styles.advancedToggleBox}>
              <Pressable
                onPress={() => setShowAdvanced((v) => !v)}
                style={styles.toggleRow}
              >
                <Ionicons
                  name={showAdvanced ? "chevron-down" : "chevron-forward"}
                  size={16}
                  color={t.textMuted}
                />
                <Text style={[styles.toggleText, { color: t.textMuted }]}>
                  Opzioni avanzate (OAuth Client ID)
                </Text>
              </Pressable>

              {showAdvanced ? (
                <View style={styles.advancedBody}>
                  <Text style={[styles.advancedNote, { color: t.textFaint }]}>
                    {isGoogle
                      ? "Se disponi di un Web Client ID creato su Google Cloud Console, puoi inserirlo qui per effettuare la sincronizzazione via API REST."
                      : "Se disponi di un Application (Client) ID registrato su Azure Portal, puoi inserirlo qui per effettuare la sincronizzazione via Microsoft Graph."}
                  </Text>
                  <TextField
                    label={isGoogle ? "Google Web Client ID" : "Azure Application Client ID"}
                    value={clientId}
                    onChangeText={setClientId}
                    placeholder={isGoogle ? "xxxx.apps.googleusercontent.com" : "Da Azure App Registrations"}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <Button
                    title={loadingOAuth ? "Accesso OAuth in corso…" : "Accedi con OAuth interattivo"}
                    icon="key-outline"
                    variant="secondary"
                    size="md"
                    onPress={handleOAuthConnect}
                    loading={loadingOAuth}
                  />
                </View>
              ) : null}
            </View>

            <Button
              title="Annulla"
              variant="ghost"
              size="md"
              onPress={handleClose}
              style={{ marginTop: spacing.xs }}
            />
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
    maxWidth: 460,
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
  section: {
    gap: spacing.md,
  },
  errorText: {
    fontSize: font.small,
    lineHeight: 18,
  },
  primaryBtn: {
    marginTop: spacing.xs,
  },
  advancedToggleBox: {
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(150,150,150,0.2)",
    paddingTop: spacing.sm,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
  },
  toggleText: {
    fontSize: font.small,
    fontWeight: "600",
  },
  advancedBody: {
    gap: spacing.sm,
    marginTop: spacing.xs,
    paddingLeft: spacing.md,
  },
  advancedNote: {
    fontSize: font.tiny,
    lineHeight: 16,
  },
});
