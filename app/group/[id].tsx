import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { cloudDeleteGroupEntirely, cloudLeaveGroup } from "@/cloud/cloudGroup";
import { shareGroupOneClick } from "@/cloud/oneClickShare";
import { formatIsoDate, monthKey, monthLabelLong } from "@/domain/dates";
import { formatMinor } from "@/domain/money";
import { useGroupActions } from "@/store/groupActions";
import { useGroupFinance, useResolvedGroup, useSelf, useSyncCloudPointer } from "@/store/selectors";
import { useStore } from "@/store/store";
import {
  Avatar,
  AvatarStack,
  Button,
  Card,
  EmptyState,
  ExpenseRow,
  Fab,
  ListRow,
  Money,
  PickerSheet,
  Screen,
  SectionHeader,
  Segmented,
  Tag,
  TransferRow,
} from "@/ui/components";
import { confirm, notify } from "@/ui/dialogs";
import { font, spacing, useTheme } from "@/ui/theme";

type Tab = "expenses" | "balances" | "settlements";
type LocalMenuAction = "share" | "edit" | "archive" | "delete";
type CloudMenuAction = "invite" | "leave" | "deleteAll";

export default function GroupDetailScreen() {
  const { id, tab: initialTab } = useLocalSearchParams<{ id: string; tab?: Tab }>();
  const router = useRouter();
  const t = useTheme();
  const self = useSelf();
  const resolved = useResolvedGroup(id);
  const { group, people, expenses, settlements, loading, error, authUser } = resolved;
  useSyncCloudPointer(resolved);
  const actions = useGroupActions(group);
  const finance = useGroupFinance(group, expenses, settlements);
  const deleteSettlement = useStore((s) => s.deleteSettlement);
  const deleteLocalPointer = useStore((s) => s.deleteGroup);
  const upsertCloudGroupPointer = useStore((s) => s.upsertCloudGroupPointer);
  const [tab, setTab] = useState<Tab>(initialTab ?? "expenses");
  const [menu, setMenu] = useState(false);
  const [simplified, setSimplified] = useState(true);
  const [busyMenu, setBusyMenu] = useState(false);
  const [sharing, setSharing] = useState(false);

  const isCloud = !!group?.cloud;
  const members = useMemo(() => (group ? group.memberIds.map((m) => people.get(m)).filter((p): p is NonNullable<typeof p> => !!p) : []), [group, people]);
  const meId = isCloud ? authUser?.uid : self?.id;
  const myBalance = meId ? finance.balances.find((b) => b.personId === meId)?.netMinor ?? 0 : 0;

  const sections = useMemo(() => {
    const map = new Map<string, typeof expenses>();
    for (const e of expenses) {
      const k = monthKey(e.date);
      map.set(k, [...(map.get(k) ?? []), e]);
    }
    return [...map.entries()];
  }, [expenses]);

  if (!group) {
    return (
      <Screen>
        <Stack.Screen options={{ title: "Gruppo" }} />
        <EmptyState icon="alert-circle-outline" title="Gruppo non trovato" actionLabel="Torna ai gruppi" onAction={() => router.replace("/groups")} />
      </Screen>
    );
  }

  if (isCloud && error === "not-signed-in") {
    return (
      <Screen>
        <Stack.Screen options={{ title: group.name }} />
        <Card>
          <EmptyState
            icon="log-in-outline"
            title="Accedi per continuare"
            message="Questo gruppo è condiviso: accedi con l'account con cui l'hai creato o con cui ti sei unito."
            actionLabel="Vai alle impostazioni"
            onAction={() => router.push("/settings")}
          />
        </Card>
      </Screen>
    );
  }

  const handleOneClickShare = async () => {
    setSharing(true);
    try {
      const allPeopleList = Array.from(people.values());
      const res = await shareGroupOneClick({
        group,
        people: allPeopleList,
        expenses,
        settlements,
        self,
        onCloudLinked: (updated) => {
          upsertCloudGroupPointer(updated);
        },
      });
      if (!res.ok) {
        notify("Condivisione non riuscita", res.error || "Si è verificato un errore");
      } else if (Platform.OS === "web") {
        notify("Link copiato!", "Il link di invito è pronto e copiato negli appunti. Invialo ai partecipanti.");
      }
    } catch (err) {
      notify("Errore", String(err));
    } finally {
      setSharing(false);
    }
  };

  const onLocalMenu = async (action: LocalMenuAction) => {
    if (action === "share") {
      void handleOneClickShare();
      return;
    }
    if (action === "edit") router.push({ pathname: "/group/edit", params: { id: group.id } });
    if (action === "archive") void actions.archive(!group.archivedAt);
    if (action === "delete") {
      const ok = await confirm("Eliminare il gruppo?", `"${group.name}" con ${expenses.length} spese e ${settlements.length} rimborsi verrà eliminato definitivamente, allegati compresi.`, {
        confirmText: "Elimina",
        destructive: true,
      });
      if (ok) {
        await deleteLocalPointer(group.id);
        router.replace("/groups");
      }
    }
  };

  const onCloudMenu = async (action: CloudMenuAction) => {
    if (!group.cloud) return;
    if (action === "invite") {
      void handleOneClickShare();
      return;
    }
    if (action === "leave") {
      const ok = await confirm("Uscire dal gruppo?", `Non vedrai più "${group.name}". Le tue spese passate restano visibili agli altri membri.`, {
        confirmText: "Esci",
        destructive: true,
      });
      if (!ok || !authUser) return;
      setBusyMenu(true);
      try {
        await cloudLeaveGroup(group.cloud, authUser.uid);
        await deleteLocalPointer(group.id);
        router.replace("/groups");
      } catch (err) {
        notify("Non riesco a uscire dal gruppo", String(err));
      } finally {
        setBusyMenu(false);
      }
      return;
    }
    if (action === "deleteAll") {
      const ok = await confirm("Eliminare il gruppo per tutti?", `"${group.name}" verrà cancellato per ogni membro, spese e rimborsi compresi. Non si può annullare.`, {
        confirmText: "Elimina per tutti",
        destructive: true,
      });
      if (!ok) return;
      setBusyMenu(true);
      try {
        await cloudDeleteGroupEntirely(group.cloud);
        await deleteLocalPointer(group.id);
        router.replace("/groups");
      } catch (err) {
        notify("Eliminazione non riuscita", String(err));
      } finally {
        setBusyMenu(false);
      }
    }
  };

  const transfers = simplified ? finance.simplified : finance.pairwise;
  const isOwner = isCloud && authUser && group.cloud?.ownerUid === authUser.uid;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: group.name,
          headerRight: () => (
            <Pressable onPress={() => setMenu(true)} hitSlop={10} style={{ paddingHorizontal: 6 }}>
              <Ionicons name="ellipsis-horizontal-circle" size={26} color={t.text} />
            </Pressable>
          ),
        }}
      />
      <Screen bottomInset={80}>
        <Card>
          <View style={styles.headerRow}>
            <View style={[styles.emoji, { backgroundColor: t.surfaceAlt }]}>
              <Text style={{ fontSize: 30 }}>{group.emoji || "👥"}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ color: t.text, fontSize: font.h2, fontWeight: "800", flexShrink: 1 }} numberOfLines={2}>
                  {group.name}
                </Text>
                {isCloud ? <Tag label="condiviso" color={t.primary} /> : null}
              </View>
              {group.description ? <Text style={{ color: t.textMuted, fontSize: font.small }}>{group.description}</Text> : null}
              <View style={{ marginTop: 6, flexDirection: "row", alignItems: "center", gap: 8 }}>
                <AvatarStack people={members} size={24} max={6} />
                <Text style={{ color: t.textMuted, fontSize: font.small }}>
                  {loading ? "sincronizzazione…" : `${members.length} persone`}
                </Text>
              </View>
            </View>
          </View>
          <View style={{ marginTop: spacing.md, flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
            <Button
              title={isCloud ? "Invita (1 click)" : "Condividi nel cloud (1 click)"}
              icon={isCloud ? "share-social-outline" : "cloud-upload-outline"}
              size="sm"
              variant={isCloud ? "secondary" : "primary"}
              loading={sharing}
              onPress={() => void handleOneClickShare()}
              style={{ flex: 1 }}
            />
            {isCloud ? (
              <Button
                title="Dettagli invito"
                icon="qr-code-outline"
                size="sm"
                variant="ghost"
                onPress={() => router.push({ pathname: "/group/invite", params: { id: group.id } })}
              />
            ) : null}
          </View>
          <View style={[styles.statsRow, { borderTopColor: t.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.statLabel, { color: t.textFaint }]}>Spesa totale</Text>
              <Money minor={finance.totalMinor} currency={group.currency} size={font.h3} weight="800" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.statLabel, { color: t.textFaint }]}>{myBalance > 0 ? "Ti devono" : myBalance < 0 ? "Devi" : "Il tuo bilancio"}</Text>
              <Money minor={Math.abs(myBalance)} currency={group.currency} size={font.h3} weight="800" color={myBalance > 0 ? t.positive : myBalance < 0 ? t.negative : t.textMuted} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.statLabel, { color: t.textFaint }]}>Spese</Text>
              <Text style={{ color: t.text, fontSize: font.h3, fontWeight: "800" }}>{expenses.length}</Text>
            </View>
          </View>
        </Card>

        <Segmented<Tab>
          options={[
            { value: "expenses", label: "Spese" },
            { value: "balances", label: "Bilanci" },
            { value: "settlements", label: "Rimborsi" },
          ]}
          value={tab}
          onChange={setTab}
        />

        {tab === "expenses" ? (
          expenses.length === 0 ? (
            <Card>
              <EmptyState
                icon="receipt-outline"
                title="Nessuna spesa"
                message="Aggiungi la prima spesa: l'icona viene scelta automaticamente dal titolo."
                actionLabel="Aggiungi spesa"
                onAction={() => router.push({ pathname: "/expense/edit", params: { groupId: group.id } })}
              />
            </Card>
          ) : (
            sections.map(([month, items]) => (
              <View key={month}>
                <SectionHeader
                  title={monthLabelLong(month)}
                  right={<Text style={{ color: t.textMuted, fontSize: font.small, fontWeight: "700" }}>{formatMinor(items.reduce((a, e) => a + (e.currency === group.currency ? e.amountMinor : 0), 0), group.currency)}</Text>}
                />
                <Card padded={false}>
                  {items.map((e, i) => (
                    <ExpenseRow key={e.id} expense={e} people={people} selfId={meId} onPress={() => router.push({ pathname: "/expense/[id]", params: { id: e.id, groupId: e.groupId } })} last={i === items.length - 1} />
                  ))}
                </Card>
              </View>
            ))
          )
        ) : null}

        {tab === "balances" ? (
          <>
            <SectionHeader title="Bilancio per persona" first />
            <Card padded={false}>
              {finance.balances.map((b, i) => {
                const p = people.get(b.personId);
                return (
                  <ListRow
                    key={b.personId}
                    leading={<Avatar person={p} size={40} />}
                    title={p?.isSelf ? `${p.name} (tu)` : p?.name ?? "?"}
                    subtitle={`ha pagato ${formatMinor(b.paidMinor + b.sentMinor, group.currency)} · quota ${formatMinor(b.owedMinor + b.receivedMinor, group.currency)}`}
                    trailing={
                      <View style={{ alignItems: "flex-end" }}>
                        <Money minor={b.netMinor} currency={group.currency} signed colored size={font.h3} weight="800" />
                        <Text style={{ color: t.textFaint, fontSize: font.tiny, fontWeight: "700" }}>{b.netMinor > 0 ? "deve ricevere" : b.netMinor < 0 ? "deve dare" : "in pari"}</Text>
                      </View>
                    }
                    last={i === finance.balances.length - 1}
                  />
                );
              })}
            </Card>

            <SectionHeader
              title="Come saldare"
              right={
                <Pressable onPress={() => setSimplified((v) => !v)} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Ionicons name={simplified ? "git-merge" : "git-branch"} size={16} color={t.primary} />
                  <Text style={{ color: t.primary, fontWeight: "700", fontSize: font.small }}>{simplified ? "Semplificato" : "Per coppia"}</Text>
                </Pressable>
              }
            />
            <Card padded={false}>
              {transfers.length === 0 ? (
                <EmptyState icon="checkmark-done-circle-outline" title="Tutto saldato" message="Nessuno deve niente a nessuno." />
              ) : (
                transfers.map((tr, i) => (
                  <TransferRow
                    key={`${tr.fromPersonId}-${tr.toPersonId}`}
                    transfer={tr}
                    people={people}
                    currency={group.currency}
                    selfId={meId}
                    onSettle={() =>
                      router.push({
                        pathname: "/settle/new",
                        params: { groupId: group.id, from: tr.fromPersonId, to: tr.toPersonId, amount: String(tr.amountMinor) },
                      })
                    }
                    last={i === transfers.length - 1}
                  />
                ))
              )}
            </Card>
            <Text style={{ color: t.textFaint, fontSize: font.tiny, marginTop: 4, lineHeight: 16 }}>
              {simplified
                ? "La semplificazione riduce al minimo il numero di pagamenti: chi salda può pagare una persona diversa da quella con cui ha il debito, il risultato finale è lo stesso."
                : "Debiti reali fra coppie di persone, senza compensazioni fra terzi."}
            </Text>
          </>
        ) : null}

        {tab === "settlements" ? (
          <>
            <View style={{ flexDirection: "row", justifyContent: "flex-end", marginBottom: spacing.sm }}>
              <Button title="Registra rimborso" icon="swap-horizontal" size="sm" variant="secondary" onPress={() => router.push({ pathname: "/settle/new", params: { groupId: group.id } })} />
            </View>
            {settlements.length === 0 ? (
              <Card>
                <EmptyState icon="swap-horizontal-outline" title="Nessun rimborso" message="Quando qualcuno restituisce dei soldi, registralo qui: i bilanci si aggiornano." />
              </Card>
            ) : (
              <Card padded={false}>
                {settlements.map((s, i) => {
                  const from = people.get(s.fromPersonId);
                  const to = people.get(s.toPersonId);
                  return (
                    <ListRow
                      key={s.id}
                      leading={
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                          <Avatar person={from} size={30} />
                          <Ionicons name="arrow-forward" size={14} color={t.textFaint} style={{ marginHorizontal: 2 }} />
                          <Avatar person={to} size={30} />
                        </View>
                      }
                      title={`${from?.name ?? "?"} → ${to?.name ?? "?"}`}
                      subtitle={`${formatIsoDate(s.date)}${s.note ? ` · ${s.note}` : ""}`}
                      trailing={
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                          <Money minor={s.amountMinor} currency={group.currency} />
                          <Pressable
                            hitSlop={8}
                            onPress={async () => {
                              const ok = await confirm("Eliminare il rimborso?", "Il bilancio tornerà a considerare il debito come aperto.", { confirmText: "Elimina", destructive: true });
                              if (!ok) return;
                              if (isCloud) await actions.deleteSettlement(s.id);
                              else deleteSettlement(s.id);
                            }}
                          >
                            <Ionicons name="trash-outline" size={18} color={t.negative} />
                          </Pressable>
                        </View>
                      }
                      last={i === settlements.length - 1}
                    />
                  );
                })}
              </Card>
            )}
          </>
        ) : null}
      </Screen>
      <Fab label="Spesa" onPress={() => router.push({ pathname: "/expense/edit", params: { groupId: group.id } })} />
      {isCloud ? (
        <PickerSheet<CloudMenuAction>
          visible={menu}
          title={group.name}
          items={[
            { value: "invite", label: "Invita persone (1 click)", subtitle: "Condividi subito il link", leading: <Ionicons name="share-social-outline" size={22} color={t.text} /> },
            { value: "leave", label: "Esci dal gruppo", subtitle: "Non vedrai più questo gruppo", leading: <Ionicons name="exit-outline" size={22} color={t.text} /> },
            ...(isOwner
              ? [{ value: "deleteAll" as const, label: "Elimina gruppo per tutti", subtitle: "Cancella tutto, per ogni membro", leading: <Ionicons name="trash-outline" size={22} color={t.negative} /> }]
              : []),
          ]}
          onSelect={(a) => void onCloudMenu(a)}
          onClose={() => setMenu(false)}
        />
      ) : (
        <PickerSheet<LocalMenuAction>
          visible={menu}
          title={group.name}
          items={[
            { value: "share", label: "Condividi nel cloud (1 click)", subtitle: "Sincronizza in tempo reale e invita", leading: <Ionicons name="cloud-upload-outline" size={22} color={t.primary} /> },
            { value: "edit", label: "Modifica gruppo", subtitle: "Nome, valuta, membri", leading: <Ionicons name="create-outline" size={22} color={t.text} /> },
            { value: "archive", label: group.archivedAt ? "Ripristina" : "Archivia", subtitle: "Nascondi dalla lista principale", leading: <Ionicons name="archive-outline" size={22} color={t.text} /> },
            { value: "delete", label: "Elimina gruppo", subtitle: "Cancella spese e rimborsi", leading: <Ionicons name="trash-outline" size={22} color={t.negative} /> },
          ]}
          onSelect={(a) => void onLocalMenu(a)}
          onClose={() => setMenu(false)}
        />
      )}
      {busyMenu ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.05)" }]} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center" },
  emoji: { width: 60, height: 60, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  statsRow: { flexDirection: "row", marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
  statLabel: { fontSize: font.tiny, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 },
});
