import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { shareGroupOneClick } from "@/cloud/oneClickShare";
import { CURRENCIES } from "@/domain/money";
import { isValidEmail, normalizeEmail } from "@/domain/validate";
import { useStore } from "@/store/store";
import { useGroup, usePeople, useSelf } from "@/store/selectors";
import { Avatar, Button, Card, Screen, SectionHeader, SelectField, TextField } from "@/ui/components";
import { font, radius, spacing, useTheme } from "@/ui/theme";

const EMOJIS = ["👥", "🏖️", "🏠", "🍕", "✈️", "🚗", "🎉", "🏔️", "🛒", "🎂", "⛺", "🍻", "🎿", "💍", "🎓", "🐶", "⚽", "🎵"];

export default function GroupEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const t = useTheme();
  const existing = useGroup(id);
  const people = usePeople();
  const self = useSelf();
  const defaultCurrency = useStore((s) => s.data.settings.defaultCurrency);
  const addGroup = useStore((s) => s.addGroup);
  const updateGroup = useStore((s) => s.updateGroup);
  const addPerson = useStore((s) => s.addPerson);
  const upsertCloudGroupPointer = useStore((s) => s.upsertCloudGroupPointer);

  const [name, setName] = useState(existing?.name ?? "");
  const [emoji, setEmoji] = useState(existing?.emoji ?? "👥");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [currency, setCurrency] = useState(existing?.currency ?? defaultCurrency);
  const [memberIds, setMemberIds] = useState<string[]>(existing?.memberIds ?? (self ? [self.id] : []));
  const [newPerson, setNewPerson] = useState("");
  const [newPersonEmail, setNewPersonEmail] = useState("");
  const [newPersonError, setNewPersonError] = useState<string | null>(null);
  const [shareInCloud, setShareInCloud] = useState(!existing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const candidates = useMemo(() => people.filter((p) => !p.archivedAt || memberIds.includes(p.id)), [people, memberIds]);

  const toggle = (pid: string) => {
    setMemberIds((ids) => (ids.includes(pid) ? ids.filter((x) => x !== pid) : [...ids, pid]));
  };

  const quickAdd = () => {
    const n = newPerson.trim();
    if (!n) return;
    if (newPersonEmail.trim() && !isValidEmail(newPersonEmail)) {
      setNewPersonError("Questa email non sembra valida.");
      return;
    }
    const p = addPerson({
      name: n,
      email: newPersonEmail.trim() ? normalizeEmail(newPersonEmail) : null,
    });
    setMemberIds((ids) => [...ids, p.id]);
    setNewPerson("");
    setNewPersonEmail("");
    setNewPersonError(null);
  };

  const save = async () => {
    if (!name.trim()) {
      setError("Dai un nome al gruppo.");
      return;
    }
    if (memberIds.length < 1) {
      setError("Seleziona almeno una persona.");
      return;
    }
    if (existing) {
      updateGroup(existing.id, { name, emoji, description, currency, memberIds });
      router.back();
    } else {
      setSaving(true);
      const g = addGroup({ name, emoji, description, currency, memberIds });
      if (shareInCloud) {
        try {
          await shareGroupOneClick({
            group: g,
            people,
            expenses: [],
            settlements: [],
            self,
            onCloudLinked: (updated) => {
              upsertCloudGroupPointer(updated);
            },
          });
        } catch {
          // Ignora se la condivisione viene annullata dall'utente
        }
      }
      router.replace({ pathname: "/group/[id]", params: { id: g.id } });
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: existing ? "Modifica gruppo" : "Nuovo gruppo" }} />
      <Card>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.md }}>
          <View style={[styles.emojiBig, { backgroundColor: t.surfaceAlt }]}>
            <Text style={{ fontSize: 30 }}>{emoji}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <TextField label="Nome" value={name} onChangeText={setName} placeholder="Es. Vacanza in Sardegna" autoFocus={!existing} error={error} />
          </View>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: spacing.sm }}>
          {EMOJIS.map((e) => (
            <Pressable key={e} onPress={() => setEmoji(e)} style={[styles.emojiChip, { backgroundColor: emoji === e ? t.primarySoft : t.surfaceAlt, borderColor: emoji === e ? t.primary : "transparent" }]}>
              <Text style={{ fontSize: 20 }}>{e}</Text>
            </Pressable>
          ))}
        </View>
        <TextField label="Descrizione (facoltativa)" value={description} onChangeText={setDescription} placeholder="Es. agosto 2026, 6 persone" />
        <SelectField
          label="Valuta del gruppo"
          value={currency}
          items={CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} · ${c.name}`, subtitle: c.symbol }))}
          onChange={setCurrency}
        />
        {existing && existing.currency !== currency ? (
          <Text style={{ color: t.warning, fontSize: font.small }}>Le spese già registrate restano nella loro valuta; cambia il tasso nelle spese se serve.</Text>
        ) : null}
        {!existing ? (
          <Pressable
            onPress={() => setShareInCloud((v) => !v)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: shareInCloud ? t.primarySoft : t.surfaceAlt,
              padding: spacing.md,
              borderRadius: radius.md,
              marginTop: spacing.md,
              borderWidth: 1,
              borderColor: shareInCloud ? t.primary : t.border,
            }}
          >
            <Ionicons
              name={shareInCloud ? "checkbox" : "square-outline"}
              size={22}
              color={shareInCloud ? t.primary : t.textMuted}
              style={{ marginRight: spacing.sm }}
            />
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.text, fontWeight: "700", fontSize: font.body }}>
                Condividi subito nel cloud (1 click)
              </Text>
              <Text style={{ color: t.textMuted, fontSize: font.tiny }}>
                Abilita la sincronizzazione in tempo reale e apre subito il foglio di condivisione
              </Text>
            </View>
          </Pressable>
        ) : null}
      </Card>

      <SectionHeader title={`Membri (${memberIds.length})`} />
      <Card>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {candidates.map((p) => {
            const on = memberIds.includes(p.id);
            return (
              <Pressable
                key={p.id}
                onPress={() => toggle(p.id)}
                style={[styles.member, { backgroundColor: on ? t.primarySoft : t.surfaceAlt, borderColor: on ? t.primary : t.border }]}
              >
                <Avatar person={p} size={26} />
                <Text style={{ color: t.text, fontWeight: "700", marginLeft: 8 }}>{p.isSelf ? `${p.name} (tu)` : p.name}</Text>
                <Ionicons name={on ? "checkmark-circle" : "ellipse-outline"} size={18} color={on ? t.primary : t.textFaint} style={{ marginLeft: 8 }} />
              </Pressable>
            );
          })}
        </View>
        <View style={{ marginTop: spacing.sm }}>
          <Text style={{ color: t.textMuted, fontSize: font.small, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>
            Aggiungi persona
          </Text>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <TextField
                value={newPerson}
                onChangeText={setNewPerson}
                placeholder="Nome"
                returnKeyType="next"
                containerStyle={{ marginBottom: 0 }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <TextField
                value={newPersonEmail}
                onChangeText={(v) => {
                  setNewPersonEmail(v);
                  setNewPersonError(null);
                }}
                placeholder="Email (facoltativa)"
                keyboardType="email-address"
                autoCapitalize="none"
                onSubmitEditing={quickAdd}
                returnKeyType="done"
                containerStyle={{ marginBottom: 0 }}
              />
            </View>
          </View>
          {newPersonError ? <Text style={{ color: t.negative, fontSize: font.small, marginTop: 6 }}>{newPersonError}</Text> : null}
          <Button
            title="Aggiungi"
            icon="person-add"
            variant="secondary"
            onPress={quickAdd}
            disabled={!newPerson.trim()}
            style={{ marginTop: spacing.sm }}
          />
        </View>
      </Card>

      <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
        <Button
          title={existing ? "Salva modifiche" : "Crea gruppo"}
          icon="checkmark"
          size="lg"
          loading={saving}
          onPress={save}
          style={{ flex: 1 }}
        />
        <Button title="Annulla" variant="secondary" size="lg" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  emojiBig: { width: 60, height: 60, borderRadius: radius.md, alignItems: "center", justifyContent: "center", marginTop: 22 },
  emojiChip: { width: 42, height: 42, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", marginRight: 6, marginBottom: 6, borderWidth: 2 },
  member: { flexDirection: "row", alignItems: "center", paddingVertical: 6, paddingLeft: 6, paddingRight: 10, borderRadius: radius.pill, borderWidth: 1, marginRight: 8, marginBottom: 8 },
});
