import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useCloudAuthUser } from "@/cloud/auth";
import { cloudCreateGroup } from "@/cloud/cloudGroup";
import { CURRENCIES } from "@/domain/money";
import type { Group } from "@/domain/types";
import { PERSON_COLORS, useStore } from "@/store/store";
import { Avatar, Button, Card, CloudSignInButtons, EmptyState, Screen, SectionHeader, SelectField, TextField } from "@/ui/components";
import { getDefaultCloudProject } from "@/cloud/defaultConfig";
import { font, radius, spacing, useTheme } from "@/ui/theme";

const EMOJIS = ["👥", "🏖️", "🏠", "🍕", "✈️", "🚗", "🎉", "🏔️", "🛒", "🎂", "⛺", "🍻", "🎿", "💍", "🎓", "🐶", "⚽", "🎵"];

export default function ShareNewGroupScreen() {
  const router = useRouter();
  const t = useTheme();
  const projects = useStore((s) => s.data.settings.cloudProjects);
  const self = useStore((s) => s.data.people.find((p) => p.isSelf));
  const upsertCloudGroupPointer = useStore((s) => s.upsertCloudGroupPointer);
  const defaultCurrency = useStore((s) => s.data.settings.defaultCurrency);

  const fallbackProject = getDefaultCloudProject();
  const availableProjects = projects.length > 0 ? projects : [fallbackProject];

  const [projectId, setProjectId] = useState<string | null>(availableProjects[0]?.id ?? fallbackProject.id);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("👥");
  const [description, setDescription] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const project = availableProjects.find((p) => p.id === projectId) ?? availableProjects[0] ?? fallbackProject;
  const authUser = useCloudAuthUser(project.config);


  const create = async () => {
    if (!project || !authUser) return;
    if (!name.trim()) {
      setError("Dai un nome al gruppo.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const link = await cloudCreateGroup(project.config, authUser.uid, {
        name,
        emoji,
        description,
        currency,
        memberIds: [],
        selfName: self?.name ?? authUser.name,
        selfColor: self?.color ?? PERSON_COLORS[0],
      });
      const now = new Date().toISOString();
      const group: Group = {
        id: link.remoteId,
        name: name.trim(),
        emoji,
        description: description.trim(),
        currency,
        memberIds: [authUser.uid],
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
        cloud: link,
      };
      upsertCloudGroupPointer(group);
      router.replace({ pathname: "/group/[id]", params: { id: group.id } });
    } catch (err) {
      setError(`Creazione non riuscita: ${String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: "Nuovo gruppo condiviso" }} />

      {projects.length > 1 ? (
        <>
          <SectionHeader title="Progetto" first />
          <Card>
            <SelectField
              value={projectId}
              items={projects.map((p) => ({ value: p.id, label: p.label, subtitle: p.config.projectId }))}
              onChange={setProjectId}
            />
          </Card>
        </>
      ) : null}

      <SectionHeader title="Accesso" first={projects.length <= 1} />
      <Card>
        {authUser === undefined ? (
          <Text style={{ color: t.textMuted }}>Verifica accesso…</Text>
        ) : authUser ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <Avatar name={authUser.name} size={32} />
            <Text style={{ color: t.text, flex: 1 }}>Accesso come {authUser.name}</Text>
            <Ionicons name="checkmark-circle" size={20} color={t.positive} />
          </View>
        ) : (
          <>
            <Text style={{ color: t.textMuted, fontSize: font.small, marginBottom: spacing.sm }}>
              Accedi per diventare l'amministratore di questo gruppo.
            </Text>
            <CloudSignInButtons config={project?.config ?? null} googleClientId={project?.googleClientId} microsoftClientId={project?.microsoftClientId} />
          </>
        )}
      </Card>

      <SectionHeader title="Gruppo" />
      <Card>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.md }}>
          <View style={[styles.emojiBig, { backgroundColor: t.surfaceAlt }]}>
            <Text style={{ fontSize: 30 }}>{emoji}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <TextField label="Nome" value={name} onChangeText={setName} placeholder="Es. Vacanza in Sardegna" error={error} />
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
      </Card>

      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Button title="Crea gruppo condiviso" icon="cloud-upload-outline" size="lg" onPress={() => void create()} loading={saving} disabled={!authUser} style={{ flex: 1 }} />
        <Button title="Annulla" variant="secondary" size="lg" onPress={() => router.back()} />
      </View>
      <Text style={{ color: t.textFaint, fontSize: font.tiny, marginTop: spacing.md, lineHeight: 16 }}>
        Dopo la creazione potrai invitare altre persone dal dettaglio del gruppo: entreranno con il proprio account Google o Microsoft.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  emojiBig: { width: 60, height: 60, borderRadius: radius.md, alignItems: "center", justifyContent: "center", marginTop: 22 },
  emojiChip: { width: 42, height: 42, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", marginRight: 6, marginBottom: 6, borderWidth: 2 },
});
