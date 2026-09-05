import { Ionicons } from "@expo/vector-icons";
import * as Sharing from "expo-sharing";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Image, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { categoryById, iconForExpense } from "@/domain/categories";
import { formatIsoDate } from "@/domain/dates";
import { convertMinor, formatMinor } from "@/domain/money";
import { attachmentFileUri, isImageMime } from "@/store/attachments";
import { useGroupActions } from "@/store/groupActions";
import { useExpense, useExpenseAttachments, useGroup, usePeopleMap, useResolvedGroup } from "@/store/selectors";
import { AttachmentThumb, Avatar, Button, Card, EmptyState, IconBadge, ListRow, Money, Overlay, Screen, SectionHeader, Tag } from "@/ui/components";
import { confirm, notify } from "@/ui/dialogs";
import { font, spacing, useTheme } from "@/ui/theme";

const METHOD_LABEL = { equal: "in parti uguali", percentage: "per percentuali", shares: "per quote", exact: "importi esatti" } as const;

export default function ExpenseDetailScreen() {
  const { id, groupId } = useLocalSearchParams<{ id: string; groupId?: string }>();
  const router = useRouter();
  const t = useTheme();
  // Con groupId (sempre passato dai link interni) i dati vengono da useResolvedGroup,
  // valido sia per gruppi locali sia condivisi; senza (link vecchi/esterni) si prova solo il percorso locale.
  const resolved = useResolvedGroup(groupId);
  const localExpense = useExpense(groupId ? undefined : id);
  const localGroup = useGroup(groupId ? undefined : localExpense?.groupId);
  const localPeople = usePeopleMap();
  const group = groupId ? resolved.group : localGroup;
  const expense = groupId ? resolved.expenses.find((e) => e.id === id) : localExpense;
  const people = groupId ? resolved.people : localPeople;
  const actions = useGroupActions(group);
  const attachments = useExpenseAttachments(expense?.id);
  const [viewer, setViewer] = useState<string | null>(null);

  if (!expense || !group) {
    return (
      <Screen>
        <Stack.Screen options={{ title: "Spesa" }} />
        <EmptyState icon="alert-circle-outline" title="Spesa non trovata" actionLabel="Indietro" onAction={() => router.back()} />
      </Screen>
    );
  }

  const cat = categoryById(expense.categoryId);
  const icon = iconForExpense(expense.title, expense.categoryId);
  const foreign = expense.currency !== group.currency;
  const self = [...people.values()].find((p) => p.isSelf);
  const mine = self ? (expense.splits ?? []).find((s) => s.personId === self.id)?.amountMinor ?? 0 : 0;
  const paidByMe = self ? (expense.payers ?? []).find((p) => p.personId === self.id)?.amountMinor ?? 0 : 0;

  const onDelete = async () => {
    const ok = await confirm("Eliminare la spesa?", `"${expense.title}" e i suoi ${attachments.length} allegati verranno eliminati.`, { confirmText: "Elimina", destructive: true });
    if (!ok) return;
    await actions.deleteExpense(expense.id, expense.title);
    router.back();
  };

  const openAttachment = async (a: (typeof attachments)[number]) => {
    const uri = await attachmentFileUri(a.storageKey);
    if (!uri) {
      notify("File non trovato", "L'allegato non è più presente nella memoria dell'app.");
      return;
    }
    if (isImageMime(a.mimeType)) {
      setViewer(uri);
      return;
    }
    if (Platform.OS === "web") {
      const w = globalThis as unknown as { open?: (u: string, target: string) => void };
      w.open?.(uri, "_blank");
      return;
    }
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: a.mimeType });
    else await Linking.openURL(uri);
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: "Dettaglio spesa" }} />
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <IconBadge icon={icon} color={cat.color} size={64} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.text, fontSize: font.h2, fontWeight: "800" }}>{expense.title}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
              <Tag label={cat.name} color={cat.color} />
              <Text style={{ color: t.textMuted, fontSize: font.small }}>{formatIsoDate(expense.date, "long")}</Text>
            </View>
          </View>
        </View>
        <View style={{ marginTop: spacing.lg }}>
          <Money minor={expense.amountMinor} currency={expense.currency} size={font.display} weight="800" />
          {foreign ? (
            <Text style={{ color: t.textMuted, fontSize: font.small }}>
              ≈ {formatMinor(convertMinor(expense.amountMinor, expense.exchangeRate, expense.currency, group.currency), group.currency)} nel gruppo (tasso {expense.exchangeRate})
            </Text>
          ) : null}
        </View>
        <Pressable onPress={() => router.push({ pathname: "/group/[id]", params: { id: group.id } })} style={{ flexDirection: "row", alignItems: "center", marginTop: spacing.md }}>
          <Text style={{ fontSize: 16 }}>{group.emoji || "👥"}</Text>
          <Text style={{ color: t.primary, fontWeight: "700", marginLeft: 6 }}>{group.name}</Text>
          <Ionicons name="chevron-forward" size={14} color={t.primary} />
        </Pressable>
        {self ? (
          <View style={[styles.mine, { backgroundColor: t.surfaceAlt }]}>
            <Text style={{ color: t.textMuted, fontSize: font.small }}>
              La tua quota: <Text style={{ color: t.text, fontWeight: "800" }}>{formatMinor(mine, expense.currency)}</Text>
              {paidByMe ? ` · hai pagato ${formatMinor(paidByMe, expense.currency)}` : ""}
            </Text>
          </View>
        ) : null}
      </Card>

      <SectionHeader title="Pagato da" />
      <Card padded={false}>
        {(expense.payers ?? []).map((p, i) => {
          const person = people.get(p.personId);
          return <ListRow key={p.personId} leading={<Avatar person={person} size={36} />} title={person?.isSelf ? `${person.name} (tu)` : person?.name ?? "Persona rimossa"} trailing={<Money minor={p.amountMinor} currency={expense.currency} />} last={i === (expense.payers ?? []).length - 1} />;
        })}
      </Card>

      <SectionHeader title={`Diviso ${METHOD_LABEL[expense.splitMethod] ?? "in parti uguali"}`} />
      <Card padded={false}>
        {(expense.splits ?? []).map((s, i) => {
          const person = people.get(s.personId);
          const detail = s.percent !== undefined ? `${s.percent}%` : s.shares !== undefined ? `${s.shares} ${s.shares === 1 ? "quota" : "quote"}` : undefined;
          return (
            <ListRow key={s.personId} leading={<Avatar person={person} size={36} />} title={person?.isSelf ? `${person.name} (tu)` : person?.name ?? "Persona rimossa"} subtitle={detail} trailing={<Money minor={s.amountMinor} currency={expense.currency} />} last={i === (expense.splits ?? []).length - 1} />
          );
        })}
      </Card>

      {expense.notes ? (
        <>
          <SectionHeader title="Note" />
          <Card>
            <Text style={{ color: t.text, lineHeight: 22 }}>{expense.notes}</Text>
          </Card>
        </>
      ) : null}

      <SectionHeader title={`Allegati (${attachments.length})`} />
      <Card>
        {attachments.length === 0 ? (
          <Text style={{ color: t.textFaint, fontSize: font.small }}>Nessun allegato. Aggiungi foto o PDF modificando la spesa.</Text>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {attachments.map((a) => (
              <AttachmentThumb key={a.id} size={96} source={{ key: a.id, fileName: a.fileName, mimeType: a.mimeType, storageKey: a.storageKey }} onPress={() => void openAttachment(a)} />
            ))}
          </View>
        )}
      </Card>

      <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
        <Button title="Modifica" icon="create-outline" size="lg" onPress={() => router.push({ pathname: "/expense/edit", params: { id: expense.id, groupId: group.id } })} style={{ flex: 1 }} />
        <Button title="Elimina" icon="trash-outline" variant="danger" size="lg" onPress={onDelete} />
      </View>

      <Overlay visible={!!viewer} onRequestClose={() => setViewer(null)}>
        <Pressable style={styles.viewer} onPress={() => setViewer(null)}>
          {viewer ? <Image source={{ uri: viewer }} style={{ width: "100%", height: "100%" }} resizeMode="contain" /> : null}
          <View style={styles.close}>
            <Ionicons name="close-circle" size={36} color="#fff" />
          </View>
        </Pressable>
      </Overlay>
    </Screen>
  );
}

const styles = StyleSheet.create({
  mine: { marginTop: spacing.md, padding: spacing.md, borderRadius: 12 },
  viewer: { flex: 1, backgroundColor: "rgba(0,0,0,0.95)", alignItems: "center", justifyContent: "center" },
  close: { position: "absolute", top: 40, right: 20 },
});
