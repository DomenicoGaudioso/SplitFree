import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { ensureAuthUser, useCloudAuthUser } from "@/cloud/auth";
import { cloudJoinGroup } from "@/cloud/cloudGroup";
import { decodeInvite, type InvitePayload } from "@/cloud/invites";
import type { Group } from "@/domain/types";
import { useStore } from "@/store/store";
import { Avatar, Button, Card, CloudSignInButtons, Screen, TextField } from "@/ui/components";
import { font, spacing, useTheme } from "@/ui/theme";

export default function JoinScreen() {
  const params = useLocalSearchParams<{ i?: string }>();
  const router = useRouter();
  const t = useTheme();
  const self = useStore((s) => s.data.people.find((p) => p.isSelf));
  const localGroups = useStore((s) => s.data.groups);
  const upsertCloudGroupPointer = useStore((s) => s.upsertCloudGroupPointer);

  const [pasted, setPasted] = useState("");
  const [payload, setPayload] = useState<InvitePayload | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (params.i) {
      const decoded = decodeInvite(`?i=${params.i}`);
      if (decoded) setPayload(decoded);
      else setParseError("Questo link di invito non è valido.");
    }
  }, [params.i]);

  const authUser = useCloudAuthUser(payload?.config ?? null);
  const alreadyMember = payload ? localGroups.some((g) => g.cloud?.remoteId === payload.groupId && g.cloud.config.projectId === payload.config.projectId) : false;

  const tryParse = () => {
    const decoded = decodeInvite(pasted);
    if (!decoded) {
      setParseError("Non riconosco questo invito: incolla il link intero ricevuto (inizia con \"splitfree://\").");
      return;
    }
    setParseError(null);
    setPayload(decoded);
  };

  const joinOneClick = async () => {
    if (!payload) return;
    setJoining(true);
    setJoinError(null);
    try {
      let user = authUser;
      if (!user) {
        user = await ensureAuthUser(payload.config, self?.name || "Nuovo Membro");
      }
      const result = await cloudJoinGroup(payload, user);
      if (!result.ok) {
        setJoinError(result.error);
        return;
      }
      const now = new Date().toISOString();
      const group: Group = {
        id: result.link.remoteId,
        name: result.group.name,
        emoji: result.group.emoji,
        description: result.group.description,
        currency: result.group.currency,
        memberIds: [],
        archivedAt: result.group.archivedAt,
        createdAt: now,
        updatedAt: now,
        cloud: result.link,
      };
      upsertCloudGroupPointer(group);
      router.replace({ pathname: "/group/[id]", params: { id: group.id } });
    } catch (err) {
      setJoinError(String(err));
    } finally {
      setJoining(false);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: "Unisciti a un gruppo" }} />

      {!payload ? (
        <Card>
          <Text style={{ color: t.textMuted, fontSize: font.small, lineHeight: 20, marginBottom: spacing.md }}>
            Incolla qui il link di invito che ti hanno mandato (inizia con "splitfree://join").
          </Text>
          <TextField
            label="Link di invito"
            value={pasted}
            onChangeText={(v) => {
              setPasted(v);
              setParseError(null);
            }}
            placeholder="splitfree://join?i=..."
            autoCapitalize="none"
            multiline
            style={{ minHeight: 60 }}
            error={parseError}
          />
          <Button title="Continua" icon="arrow-forward" onPress={tryParse} disabled={!pasted.trim()} />
        </Card>
      ) : (
        <>
          <Card>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
              <Text style={{ fontSize: 34 }}>{payload.emoji || "👥"}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontWeight: "800", fontSize: font.h3 }}>{payload.groupName}</Text>
                <Text style={{ color: t.textMuted, fontSize: font.small }}>Gruppo condiviso · {payload.currency}</Text>
              </View>
            </View>
          </Card>

          {alreadyMember ? (
            <Card>
              <Text style={{ color: t.text, marginBottom: spacing.md }}>Fai già parte di questo gruppo su questo dispositivo.</Text>
              <Button title="Apri il gruppo" onPress={() => router.replace({ pathname: "/group/[id]", params: { id: payload.groupId } })} />
            </Card>
          ) : (
            <Card>
              {authUser === undefined ? (
                <Text style={{ color: t.textMuted }}>Verifica accesso…</Text>
              ) : authUser ? (
                <>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md }}>
                    <Avatar name={authUser.name} size={32} />
                    <Text style={{ color: t.text, flex: 1 }}>Entrerai come {authUser.name}</Text>
                    <Ionicons name="checkmark-circle" size={20} color={t.positive} />
                  </View>
                  <Button title="Entra subito nel gruppo (1 Click)" icon="log-in-outline" size="lg" onPress={() => void joinOneClick()} loading={joining} />
                </>
              ) : (
                <>
                  <Button
                    title="Entra subito nel gruppo (1 Click)"
                    icon="flash-outline"
                    size="lg"
                    onPress={() => void joinOneClick()}
                    loading={joining}
                    style={{ marginBottom: spacing.md }}
                  />
                  <Text style={{ color: t.textMuted, fontSize: font.small, marginBottom: spacing.sm }}>
                    Oppure accedi prima con il tuo account preferito:
                  </Text>
                  <CloudSignInButtons config={payload.config} googleClientId={payload.googleClientId} microsoftClientId={payload.microsoftClientId} />
                </>
              )}
              {joinError ? <Text style={{ color: t.negative, fontSize: font.small, marginTop: spacing.md }}>{joinError}</Text> : null}
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}
