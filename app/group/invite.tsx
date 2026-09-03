import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Share, Text, View } from "react-native";
import { cloudCreateInvite } from "@/cloud/cloudGroup";
import { buildInviteLink } from "@/cloud/invites";
import { useResolvedGroup } from "@/store/selectors";
import { Button, Card, EmptyState, Screen } from "@/ui/components";
import { notify } from "@/ui/dialogs";
import { font, radius, spacing, useTheme } from "@/ui/theme";

export default function InviteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const t = useTheme();
  const { group, authUser } = useResolvedGroup(id);
  const [link, setLink] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!group?.cloud) {
    return (
      <Screen>
        <Stack.Screen options={{ title: "Invita" }} />
        <EmptyState icon="alert-circle-outline" title="Gruppo non disponibile" actionLabel="Indietro" onAction={() => router.back()} />
      </Screen>
    );
  }
  const cloud = group.cloud;

  const generate = async () => {
    if (!authUser) return;
    setCreating(true);
    setError(null);
    try {
      const payload = await cloudCreateInvite(cloud, authUser.uid, group.name, group.emoji, group.currency);
      setLink(buildInviteLink(payload));
    } catch (err) {
      setError(`Non riesco a creare l'invito: ${String(err)}`);
    } finally {
      setCreating(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    await Clipboard.setStringAsync(link);
    notify("Copiato", "Il link è negli appunti.");
  };

  const share = async () => {
    if (!link) return;
    try {
      await Share.share({ message: `Unisciti al gruppo "${group.name}" su SplitFree: ${link}` });
    } catch {
      // l'utente ha chiuso il foglio di condivisione
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: "Invita persone" }} />
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md }}>
          <Text style={{ fontSize: 24 }}>{group.emoji || "👥"}</Text>
          <Text style={{ color: t.text, fontWeight: "800", fontSize: font.h3 }}>{group.name}</Text>
        </View>
        <Text style={{ color: t.textMuted, fontSize: font.small, lineHeight: 20, marginBottom: spacing.md }}>
          Chi apre questo link entra nel gruppo con il proprio account Google o Microsoft e vede subito spese e bilanci in tempo reale. Funziona solo se ha già installato SplitFree.
        </Text>

        {link ? (
          <>
            <View style={[styles(t).linkBox]}>
              <Text style={{ color: t.text, fontSize: font.small }} selectable numberOfLines={4}>
                {link}
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" }}>
              <Button title="Condividi" icon="share-outline" onPress={() => void share()} />
              <Button title="Copia link" icon="copy-outline" variant="secondary" onPress={() => void copy()} />
              <Button title="Genera un nuovo link" icon="refresh" variant="ghost" onPress={() => void generate()} loading={creating} />
            </View>
          </>
        ) : (
          <Button title="Genera link di invito" icon="link" onPress={() => void generate()} loading={creating} disabled={!authUser} />
        )}
        {error ? (
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: spacing.md }}>
            <Ionicons name="alert-circle" size={16} color={t.negative} />
            <Text style={{ color: t.negative, marginLeft: 6, fontSize: font.small, flex: 1 }}>{error}</Text>
          </View>
        ) : null}
      </Card>
      <Text style={{ color: t.textFaint, fontSize: font.tiny, lineHeight: 16 }}>
        Ogni link resta attivo finché non ne generi uno nuovo o non lo disattivi dalla console Firebase del progetto. Chiunque abbia il link può unirsi.
      </Text>
    </Screen>
  );
}

const styles = (t: ReturnType<typeof useTheme>) => ({
  linkBox: { backgroundColor: t.surfaceAlt, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: t.border },
});
