import { useState } from "react";
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
import { formatAuthError, sendPasswordReset, signInWithEmail, signUpWithEmail } from "@/cloud/auth";
import type { FirebaseWebConfig } from "@/domain/types";
import { font, radius, spacing, useTheme } from "../theme";
import { Button } from "./Button";
import { TextField } from "./TextField";

type Props = {
  visible: boolean;
  config: FirebaseWebConfig;
  onClose: () => void;
  onSuccess?: () => void;
};

export function EmailAuthModal({ visible, config, onClose, onSuccess }: Props) {
  const t = useTheme();
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  function resetState() {
    setName("");
    setEmail("");
    setPassword("");
    setError(null);
    setInfoMessage(null);
    setLoading(false);
  }

  function handleClose() {
    resetState();
    onClose();
  }

  async function handleSubmit() {
    setError(null);
    setInfoMessage(null);
    const cleanEmail = email.trim();

    if (!cleanEmail) {
      setError("Inserisci il tuo indirizzo email.");
      return;
    }
    if (!password) {
      setError("Inserisci la password.");
      return;
    }

    setLoading(true);
    try {
      if (isRegister) {
        await signUpWithEmail(config, cleanEmail, password, name.trim());
      } else {
        await signInWithEmail(config, cleanEmail, password);
      }
      resetState();
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    setError(null);
    setInfoMessage(null);
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError("Inserisci prima la tua email per ricevere il link di recupero.");
      return;
    }
    setLoading(true);
    try {
      await sendPasswordReset(config, cleanEmail);
      setInfoMessage("Email di recupero inviata! Controlla la tua casella di posta.");
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={[styles.dialog, { backgroundColor: t.surface, borderColor: t.border }]}>
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.header}>
              <Text style={[styles.title, { color: t.text }]}>
                {isRegister ? "Crea un account" : "Accedi con Email"}
              </Text>
              <Text style={[styles.subtitle, { color: t.textMuted }]}>
                {isRegister
                  ? "Registrati per sincronizzare e condividere le tue spese su qualsiasi dispositivo."
                  : "Inserisci email e password per accedere al tuo account."}
              </Text>
            </View>

            {/* Segmented switch Accedi / Registrati */}
            <View style={[styles.tabBar, { backgroundColor: t.surfaceAlt, borderColor: t.border }]}>
              <Pressable
                onPress={() => {
                  setIsRegister(false);
                  setError(null);
                  setInfoMessage(null);
                }}
                style={[
                  styles.tabItem,
                  !isRegister && [styles.tabItemActive, { backgroundColor: t.surface }],
                ]}
              >
                <Text
                  style={[
                    styles.tabText,
                    { color: !isRegister ? t.primary : t.textMuted, fontWeight: !isRegister ? "700" : "500" },
                  ]}
                >
                  Accedi
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setIsRegister(true);
                  setError(null);
                  setInfoMessage(null);
                }}
                style={[
                  styles.tabItem,
                  isRegister && [styles.tabItemActive, { backgroundColor: t.surface }],
                ]}
              >
                <Text
                  style={[
                    styles.tabText,
                    { color: isRegister ? t.primary : t.textMuted, fontWeight: isRegister ? "700" : "500" },
                  ]}
                >
                  Registrati
                </Text>
              </Pressable>
            </View>

            {isRegister && (
              <TextField
                label="Nome e Cognome (opzionale)"
                placeholder="es. Mario Rossi"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                editable={!loading}
              />
            )}

            <TextField
              label="Indirizzo Email"
              placeholder="es. mario@esempio.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />

            <TextField
              label="Password"
              placeholder="Minimo 6 caratteri"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!loading}
            />

            {error && (
              <View style={[styles.alertBox, { backgroundColor: t.negativeSoft, borderColor: t.negative }]}>
                <Text style={[styles.alertText, { color: t.negative }]}>{error}</Text>
              </View>
            )}

            {infoMessage && (
              <View style={[styles.alertBox, { backgroundColor: t.positiveSoft, borderColor: t.positive }]}>
                <Text style={[styles.alertText, { color: t.positive }]}>{infoMessage}</Text>
              </View>
            )}

            {!isRegister && (
              <Pressable onPress={handleForgotPassword} disabled={loading} style={styles.forgotBtn}>
                <Text style={[styles.forgotText, { color: t.primary }]}>Password dimenticata?</Text>
              </Pressable>
            )}

            <View style={styles.actions}>
              <Button
                title={isRegister ? "Crea account" : "Accedi"}
                onPress={handleSubmit}
                loading={loading}
                variant="primary"
                style={styles.submitBtn}
              />
              <Button
                title="Annulla"
                onPress={handleClose}
                disabled={loading}
                variant="ghost"
              />
            </View>
          </ScrollView>
        </View>
      </View>
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
  dialog: {
    width: "100%",
    maxWidth: 440,
    borderRadius: radius.xl,
    borderWidth: 1,
    overflow: "hidden",
    maxHeight: "90%",
    ...Platform.select({
      web: {
        boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.2)",
      },
      default: {
        elevation: 8,
      },
    }),
  },
  scrollContent: {
    padding: spacing.xl,
  },
  header: {
    marginBottom: spacing.md,
  },
  title: {
    fontSize: font.h2,
    fontWeight: "800",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: font.body,
    lineHeight: 20,
  },
  tabBar: {
    flexDirection: "row",
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 3,
    marginBottom: spacing.lg,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
  },
  tabItemActive: {
    ...Platform.select({
      web: { boxShadow: "0 1px 3px rgba(0,0,0,0.1)" },
      default: { elevation: 2 },
    }),
  },
  tabText: {
    fontSize: font.body,
  },
  alertBox: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  alertText: {
    fontSize: font.small,
    fontWeight: "600",
  },
  forgotBtn: {
    alignSelf: "flex-end",
    marginBottom: spacing.md,
    paddingVertical: 4,
  },
  forgotText: {
    fontSize: font.small,
    fontWeight: "600",
  },
  actions: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  submitBtn: {
    width: "100%",
  },
});
