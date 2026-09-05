import { useEffect, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { isValidIsoDate, todayIso } from "@/domain/dates";
import { font, radius, spacing, useTheme } from "../theme";
import { Button } from "./Button";
import { TextField } from "./TextField";

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Chiamato con una data ISO validata; il conteggio e la conferma restano al chiamante. */
  onSubmit: (isoDate: string) => void;
};

/** Elimina in blocco le spese del gruppo precedenti a una data (i rimborsi restano). */
export function DeleteExpensesBeforeModal({ visible, onClose, onSubmit }: Props) {
  const t = useTheme();
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setDate("");
      setError(null);
    }
  }, [visible]);

  function handleSubmit() {
    const d = date.trim();
    if (!isValidIsoDate(d)) {
      setError("Data non valida: usa il formato AAAA-MM-GG (es. 2025-01-01).");
      return;
    }
    setError(null);
    onSubmit(d);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: t.surface, borderColor: t.border }]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <View style={[styles.iconBox, { backgroundColor: t.negative + "18" }]}>
              <Ionicons name="trash-outline" size={28} color={t.negative} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: t.text }]}>Elimina spese prima di una data</Text>
              <Text style={[styles.subtitle, { color: t.textMuted }]}>
                Tutte le spese del gruppo precedenti alla data scelta verranno eliminate. I rimborsi non vengono toccati.
              </Text>
            </View>
          </View>
          <View style={styles.section}>
            <TextField
              label="Elimina le spese prima del"
              value={date}
              onChangeText={setDate}
              placeholder={`es. ${todayIso()}`}
              autoCapitalize="none"
              autoCorrect={false}
              error={error}
            />
            <Button title="Continua" icon="trash-outline" variant="danger" size="lg" onPress={handleSubmit} disabled={!date.trim()} />
            <Button title="Annulla" variant="ghost" size="md" onPress={onClose} />
          </View>
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
    padding: spacing.lg,
    ...Platform.select({
      web: { boxShadow: "0 8px 30px rgba(0,0,0,0.22)" },
      default: { elevation: 8 },
    }),
  },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.md },
  iconBox: { width: 48, height: 48, borderRadius: radius.md, justifyContent: "center", alignItems: "center" },
  title: { fontSize: font.h2, fontWeight: "700" },
  subtitle: { fontSize: font.small, lineHeight: 18, marginTop: 2 },
  section: { gap: spacing.md },
});
