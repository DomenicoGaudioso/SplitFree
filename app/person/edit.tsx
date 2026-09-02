import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { PERSON_COLORS, useStore } from "@/store/store";
import { Avatar, Button, Card, Screen, SectionHeader, TextField } from "@/ui/components";
import { confirm, notify } from "@/ui/dialogs";
import { font, spacing, useTheme } from "@/ui/theme";

export default function PersonEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const t = useTheme();
  const existing = useStore((s) => (id ? s.data.people.find((p) => p.id === id) : undefined));
  const addPerson = useStore((s) => s.addPerson);
  const updatePerson = useStore((s) => s.updatePerson);
  const archivePerson = useStore((s) => s.archivePerson);
  const deletePerson = useStore((s) => s.deletePerson);
  const updateSettings = useStore((s) => s.updateSettings);
  const peopleCount = useStore((s) => s.data.people.length);

  const [name, setName] = useState(existing?.name ?? "");
  const [color, setColor] = useState(existing?.color ?? PERSON_COLORS[peopleCount % PERSON_COLORS.length]);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    if (!name.trim()) {
      setError("Inserisci un nome.");
      return;
    }
    if (existing) {
      updatePerson(existing.id, { name: name.trim(), color });
      if (existing.isSelf) updateSettings({ ownerName: name.trim() });
    } else {
      addPerson({ name, color });
    }
    router.back();
  };

  const onDelete = async () => {
    if (!existing) return;
    const ok = await confirm("Eliminare la persona?", `${existing.name} verrà rimossa da tutti i gruppi.`, { confirmText: "Elimina", destructive: true });
    if (!ok) return;
    const res = deletePerson(existing.id);
    if (!res.ok) {
      notify("Non eliminabile", res.reason);
      return;
    }
    router.back();
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: existing ? "Modifica persona" : "Nuova persona" }} />
      <Card>
        <View style={{ alignItems: "center", marginBottom: spacing.lg }}>
          <Avatar name={name || "?"} color={color} size={84} />
        </View>
        <TextField label="Nome" value={name} onChangeText={setName} placeholder="Es. Giulia" autoFocus={!existing} error={error} />
        <Text style={{ color: t.textMuted, fontSize: font.small, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>Colore</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {PERSON_COLORS.map((c) => (
            <Pressable key={c} onPress={() => setColor(c)} style={[styles.swatch, { backgroundColor: c, borderColor: color === c ? t.text : "transparent" }]} />
          ))}
        </View>
      </Card>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Button title={existing ? "Salva" : "Aggiungi"} icon="checkmark" size="lg" onPress={save} style={{ flex: 1 }} />
        <Button title="Annulla" variant="secondary" size="lg" onPress={() => router.back()} />
      </View>
      {existing && !existing.isSelf ? (
        <>
          <SectionHeader title="Gestione" />
          <Card>
            <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
              <Button
                title={existing.archivedAt ? "Ripristina" : "Archivia"}
                icon="archive-outline"
                variant="secondary"
                onPress={() => {
                  archivePerson(existing.id, !existing.archivedAt);
                  router.back();
                }}
              />
              <Button title="Elimina" icon="trash-outline" variant="danger" onPress={onDelete} />
            </View>
            <Text style={{ color: t.textFaint, fontSize: font.tiny, marginTop: spacing.md }}>
              Archiviare nasconde la persona dalle nuove spese senza toccare lo storico. Eliminare è possibile solo se non compare in spese o rimborsi.
            </Text>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  swatch: { width: 36, height: 36, borderRadius: 18, marginRight: 10, marginBottom: 10, borderWidth: 3 },
});
