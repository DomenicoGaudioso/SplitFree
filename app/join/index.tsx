import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, Text, View } from "react-native";
import { ensureAuthUser, useCloudAuthUser } from "@/cloud/auth";
import { cloudJoinGroup } from "@/cloud/cloudGroup";
import { pullSharedGroup } from "@/cloud/fileShare/sync";
import { decodeInvite, isFileInvite, type FileInvitePayload, type InvitePayload } from "@/cloud/invites";
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
  const deleteLocalPointer = useStore((s) => s.deleteGroup);

  const [pasted, setPasted] = useState("");
  const [payload, setPayload] = useState<InvitePayload | FileInvitePayload | null>(null);
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

  const isFile = isFileInvite(payload);
  const authUser = useCloudAuthUser(!isFile && payload ? payload.config : null);
  const alreadyMember = payload
    ? isFile
      ? localGroups.some((g) => g.id === payload.groupId || g.fileShare?.fileId === payload.fileId)
      : localGroups.some((g) => g.cloud?.remoteId === payload.groupId && g.cloud.config.projectId === (payload as InvitePayload).config.projectId)
    : false;

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
    if (!payload || isFile) return;
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

  /**
   * Adesione a un gruppo condiviso via file (invito v2): nessun account richiesto.
   * Crea il puntatore locale col fileShare, aggiunge la persona isSelf come membro,
   * scarica subito il documento e, solo se il download riesce, entra nel gruppo.
   * Con WebDAV le credenziali del server viaggiano nell'invito e finiscono nel
   * fileShare del gruppo: il membro può scrivere subito, senza collegare nulla.
   */
  const joinFileShare = async () => {
    if (!payload || !isFile) return;
    setJoining(true);
    setJoinError(null);
    try {
      const now = new Date().toISOString();
      const group: Group = {
        id: payload.groupId,
        name: payload.groupName,
        emoji: payload.emoji,
        description: "",
        currency: payload.currency,
        memberIds: self ? [self.id] : [],
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
        fileShare: {
          provider: payload.provider,
          fileId: payload.fileId,
          shareUrl: payload.shareUrl,
          ownerName: payload.ownerName,
          lastSyncedAt: null,
          webdav: payload.provider === "webdav" ? payload.webdav : undefined,
          // Telegram: il messageId non viaggia nell'invito, si scopre dal pin al primo pull.
          telegram: payload.provider === "telegram" && payload.telegram
            ? { botToken: payload.telegram.botToken, chatId: payload.telegram.chatId, messageId: null }
            : undefined,
        },
      };
      upsertCloudGroupPointer(group);
      const res = await pullSharedGroup(group.id);
      if (!res.ok) {
        // File illeggibile o eliminato: toglie il puntatore appena creato.
        await deleteLocalPointer(group.id);
        setJoinError(res.error || "Impossibile scaricare il file del gruppo.");
        return;
      }
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
          ) : isFile ? (
            <Card>
              <Text style={{ color: t.textMuted, fontSize: font.small, lineHeight: 20, marginBottom: spacing.md }}>
                {payload.provider === "telegram"
                  ? `Condiviso da ${payload.ownerName} via Telegram: questo gruppo vive su Telegram, riceverai gli aggiornamenti lì. Il link contiene il token del bot, quindi potrai subito leggere e aggiungere spese: trattalo come un segreto.`
                  : payload.provider === "webdav"
                    ? `Condiviso da ${payload.ownerName} via WebDAV: il link contiene le credenziali del server, quindi potrai subito leggere e aggiungere spese. Trattalo come un segreto.`
                    : `Condiviso da ${payload.ownerName} via ${payload.provider === "onedrive" ? "OneDrive" : "Google Drive"}: per entrare e leggere non serve nessun account. Per aggiungere spese collegherai il tuo account ${payload.provider === "onedrive" ? "OneDrive" : "Google Drive"} dalle Impostazioni.`}
              </Text>
              <Button title="Entra nel gruppo" icon="log-in-outline" size="lg" onPress={() => void joinFileShare()} loading={joining} />
              {payload.provider === "telegram" && payload.telegram?.tgInviteLink ? (
                <Button
                  title="Entra nel gruppo Telegram per le notifiche"
                  icon="paper-plane-outline"
                  variant="secondary"
                  size="sm"
                  onPress={() => void Linking.openURL(payload.telegram!.tgInviteLink!).catch(() => undefined)}
                  style={{ marginTop: spacing.sm }}
                />
              ) : null}
              {joinError ? <Text style={{ color: t.negative, fontSize: font.small, marginTop: spacing.md }}>{joinError}</Text> : null}
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
