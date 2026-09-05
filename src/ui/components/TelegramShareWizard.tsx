import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { shareGroupViaTelegram } from "@/cloud/fileShare/share";
import {
  createGroupInviteLink,
  getBotUsername,
  startGroupUrl,
  waitForNewGroupChat,
} from "@/cloud/fileShare/telegramSync";
import type { Expense, Group, Person, Settlement } from "@/domain/types";
import { useStore } from "@/store/store";
import { notify } from "@/ui/dialogs";
import { font, radius, spacing, useTheme } from "../theme";
import { Button } from "./Button";
import { TextField } from "./TextField";

/**
 * Wizard guidato di condivisione via Telegram (provider consigliato):
 * l'utente non cerca mai la chat ID a mano.
 *
 * Passo 1 — Bot: token da @BotFather (o quello già salvato, verificato con getMe).
 * Passo 2 — Gruppo Telegram: deep link `t.me/<bot>?startgroup=1` per creare il
 *   gruppo col bot dentro; l'app rileva da sé la chat via getUpdates long polling.
 * Passo 3 — Condivisione: automatica (pubblica il documento pinnato, crea il link
 *   d'invito Telegram, apre il foglio di condivisione con l'invito SplitFree).
 *
 * Se il gruppo è già condiviso via Telegram il wizard salta direttamente al
 * passo 3 con le credenziali esistenti (ri-condivisione / nuovo invito).
 */

type Props = {
  visible: boolean;
  group: Group;
  people: Person[];
  expenses: Expense[];
  settlements: Settlement[];
  self: Person | null | undefined;
  /** Chiamato col gruppo aggiornato (campo fileShare valorizzato). */
  onLinked: (updatedGroup: Group) => void;
  onClose: () => void;
};

type Step = "bot" | "group" | "share";

export function TelegramShareWizard({ visible, group, people, expenses, settlements, self, onLinked, onClose }: Props) {
  const t = useTheme();
  const telegramSettings = useStore((s) => s.data.settings.telegram);
  const updateTelegramSettings = useStore((s) => s.updateTelegramSettings);

  const [step, setStep] = useState<Step>("bot");
  const [botToken, setBotToken] = useState("");
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [foundChat, setFoundChat] = useState<{ chatId: string; title: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const waitAbort = useRef<AbortController | null>(null);

  const existingCreds = group.fileShare?.provider === "telegram" ? group.fileShare.telegram : undefined;

  // All'apertura: decide da quale passo partire.
  useEffect(() => {
    if (!visible) return;
    setError(null);
    setFoundChat(null);
    setWaiting(false);
    setTokenInput("");

    // Ri-condivisione: credenziali già nel gruppo → si va dritti alla condivisione.
    if (existingCreds?.botToken && existingCreds.chatId) {
      setBotToken(existingCreds.botToken);
      setFoundChat({ chatId: existingCreds.chatId, title: "gruppo Telegram già collegato" });
      setStep("share");
      return;
    }

    const savedToken = telegramSettings?.botToken.trim() ?? "";
    if (!savedToken) {
      setStep("bot");
      return;
    }
    // Token salvato: verifica e salta al passo gruppo.
    setBotToken(savedToken);
    setBusy(true);
    let cancelled = false;
    getBotUsername(savedToken)
      .then((username) => {
        if (cancelled) return;
        setBotUsername(username);
        setStep("group");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setStep("bot");
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Passo 3 automatico: pubblica e condivide appena si arriva al passo "share".
  useEffect(() => {
    if (!visible || step !== "share" || !foundChat || !botToken) return;
    let cancelled = false;
    setBusy(true);
    setError(null);
    void (async () => {
      // Il link d'invito Telegram è un di più: se fallisce (es. bot non admin)
      // la condivisione SplitFree prosegue comunque senza.
      let tgInviteLink: string | undefined;
      try {
        tgInviteLink = await createGroupInviteLink(botToken, foundChat.chatId);
      } catch {
        tgInviteLink = undefined;
      }
      const res = await shareGroupViaTelegram({
        group,
        people,
        expenses,
        settlements,
        self,
        creds: { botToken, chatId: foundChat.chatId },
        tgInviteLink,
        onLinked,
      });
      if (cancelled) return;
      setBusy(false);
      if (!res.ok) {
        setError(res.error || "Si è verificato un errore");
        setStep("group");
        return;
      }
      if (Platform.OS === "web") {
        notify("Link copiato!", "Il link di invito è pronto e copiato negli appunti. Invialo ai partecipanti.");
      } else {
        notify("Gruppo condiviso", "Il documento del gruppo è stato pubblicato e pinnato nel gruppo Telegram.");
      }
      onClose();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, step, foundChat, botToken]);

  function handleClose() {
    waitAbort.current?.abort();
    waitAbort.current = null;
    setError(null);
    setBusy(false);
    setWaiting(false);
    onClose();
  }

  async function handleVerifyToken() {
    const token = tokenInput.trim();
    if (!token) {
      setError("Incolla il token che ti ha dato @BotFather.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const username = await getBotUsername(token);
      updateTelegramSettings({ botToken: token });
      setBotToken(token);
      setBotUsername(username);
      setStep("group");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateGroup() {
    if (!botToken) return;
    setError(null);
    if (botUsername) {
      // Apre Telegram sul selettore "aggiungi a un gruppo": da lì l'utente crea
      // un NUOVO gruppo col bot dentro e aggiunge i partecipanti.
      void Linking.openURL(startGroupUrl(botUsername)).catch(() => undefined);
    }
    // Nel frattempo l'app ascolta getUpdates finché il bot non entra in un gruppo nuovo.
    const controller = new AbortController();
    waitAbort.current = controller;
    setWaiting(true);
    try {
      const exclude = [telegramSettings?.chatId, existingCreds?.chatId]
        .map((c) => c?.trim())
        .filter((c): c is string => !!c);
      const chat = await waitForNewGroupChat(botToken, { excludeChatIds: exclude, signal: controller.signal });
      updateTelegramSettings({ chatId: chat.chatId });
      setFoundChat(chat);
      setStep("share");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg !== "Attesa annullata.") setError(msg);
    } finally {
      setWaiting(false);
      waitAbort.current = null;
    }
  }

  function handleCancelWait() {
    waitAbort.current?.abort();
  }

  const stepTitle =
    step === "bot" ? "Passo 1 di 3 · Il tuo bot" : step === "group" ? "Passo 2 di 3 · Il gruppo Telegram" : "Passo 3 di 3 · Condivisione";

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: t.surface, borderColor: t.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.header}>
              <View style={[styles.brandIconBox, { backgroundColor: "#229ED918" }]}>
                <Ionicons name="paper-plane" size={26} color="#229ED9" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: t.text }]}>Condividi via Telegram</Text>
                <Text style={[styles.subtitle, { color: t.textMuted }]}>{stepTitle}</Text>
              </View>
            </View>

            {busy && step !== "group" && !foundChat ? (
              <View style={styles.centerRow}>
                <ActivityIndicator color={t.primary} />
                <Text style={{ color: t.textMuted, fontSize: font.small }}>Verifica in corso…</Text>
              </View>
            ) : null}

            {step === "bot" && !busy ? (
              <View style={styles.section}>
                <Text style={[styles.body, { color: t.textMuted }]}>
                  Il file del gruppo vivrà in un gruppo Telegram gestito da un bot tuo. Crearlo è gratis e richiede un
                  minuto: apri @BotFather, invia /newbot e incolla qui il token che ricevi.
                </Text>
                <Button
                  title="Apri @BotFather"
                  icon="open-outline"
                  variant="secondary"
                  size="md"
                  onPress={() => void Linking.openURL("https://t.me/BotFather").catch(() => undefined)}
                />
                <TextField
                  label="Token del bot"
                  value={tokenInput}
                  onChangeText={(v) => {
                    setTokenInput(v);
                    setError(null);
                  }}
                  placeholder="123456789:AAE..."
                  autoCapitalize="none"
                  autoCorrect={false}
                  error={error ?? undefined}
                />
                <Button title="Verifica e continua" icon="checkmark-circle-outline" size="lg" onPress={() => void handleVerifyToken()} loading={busy} />
              </View>
            ) : null}

            {step === "group" ? (
              <View style={styles.section}>
                <Text style={[styles.body, { color: t.textMuted }]}>
                  {botUsername ? `Bot collegato: @${botUsername}. ` : ""}Crea un gruppo Telegram dedicato a "
                  {group.name}", con dentro il bot e i partecipanti.
                </Text>
                {foundChat ? (
                  <View style={styles.centerRow}>
                    <Ionicons name="checkmark-circle" size={20} color={t.positive} />
                    <Text style={{ color: t.text, fontSize: font.body, fontWeight: "700" }}>Gruppo trovato: {foundChat.title}</Text>
                  </View>
                ) : waiting ? (
                  <>
                    <View style={styles.centerRow}>
                      <ActivityIndicator color={t.primary} />
                      <Text style={{ color: t.textMuted, fontSize: font.small, flex: 1 }}>
                        In attesa del gruppo… crea il gruppo, aggiungi i partecipanti e torna qui: rilevo io la chat.
                      </Text>
                    </View>
                    <Button title="Annulla attesa" variant="ghost" size="sm" onPress={handleCancelWait} />
                  </>
                ) : (
                  <Button
                    title="Crea il gruppo Telegram col bot"
                    icon="people-outline"
                    size="lg"
                    onPress={() => void handleCreateGroup()}
                  />
                )}
                {error ? <Text style={[styles.errorText, { color: t.negative }]}>{error}</Text> : null}
              </View>
            ) : null}

            {step === "share" ? (
              <View style={styles.section}>
                <View style={styles.centerRow}>
                  <ActivityIndicator color={t.primary} />
                  <Text style={{ color: t.textMuted, fontSize: font.small, flex: 1 }}>
                    Pubblico il documento nel gruppo Telegram e preparo l'invito…
                  </Text>
                </View>
                {error ? <Text style={[styles.errorText, { color: t.negative }]}>{error}</Text> : null}
              </View>
            ) : null}

            <Button title="Chiudi" variant="ghost" size="md" onPress={handleClose} style={{ marginTop: spacing.sm }} />
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
    marginTop: 2,
  },
  section: {
    gap: spacing.md,
  },
  body: {
    fontSize: font.small,
    lineHeight: 20,
  },
  centerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  errorText: {
    fontSize: font.small,
    lineHeight: 18,
  },
});
