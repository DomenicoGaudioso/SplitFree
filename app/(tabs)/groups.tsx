import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { computeBalances } from "@/domain/balances";
import { formatMinor } from "@/domain/money";
import { useStore } from "@/store/store";
import { useGroups, usePeopleMap, useSelf } from "@/store/selectors";
import { AvatarStack, Button, Card, EmptyState, Fab, PickerSheet, Screen, SectionHeader, Tag } from "@/ui/components";
import { font, spacing, useTheme } from "@/ui/theme";

export default function GroupsScreen() {
  const router = useRouter();
  const t = useTheme();
  const groups = useGroups();
  const people = usePeopleMap();
  const self = useSelf();
  const expenses = useStore((s) => s.data.expenses);
  const settlements = useStore((s) => s.data.settlements);
  const [showArchived, setShowArchived] = useState(false);
  const [newMenu, setNewMenu] = useState(false);

  const rows = useMemo(
    () =>
      groups.map((group) => {
        if (group.cloud) return { group, total: 0, mine: 0, count: 0 };
        const balances = computeBalances(group, expenses, settlements);
        const total = balances.reduce((a, b) => a + b.owedMinor, 0);
        const mine = self ? balances.find((b) => b.personId === self.id)?.netMinor ?? 0 : 0;
        const count = expenses.filter((e) => e.groupId === group.id).length;
        return { group, total, mine, count };
      }),
    [groups, expenses, settlements, self]
  );
  const active = rows.filter((r) => !r.group.archivedAt);
  const archived = rows.filter((r) => r.group.archivedAt);

  const renderRow = ({ group, total, mine, count }: (typeof rows)[number]) => (
    <Card key={group.id} onPress={() => router.push({ pathname: "/group/[id]", params: { id: group.id } })}>
      <View style={styles.row}>
        <View style={[styles.emoji, { backgroundColor: t.surfaceAlt }]}>
          <Text style={{ fontSize: 26 }}>{group.emoji || "👥"}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ color: t.text, fontWeight: "800", fontSize: font.h3, flexShrink: 1 }} numberOfLines={1}>
              {group.name}
            </Text>
            {group.cloud ? <Tag label="condiviso" color={t.primary} /> : null}
            {group.archivedAt ? <Tag label="archiviato" color={t.textFaint} /> : null}
          </View>
          <Text style={{ color: t.textMuted, fontSize: font.small, marginTop: 2 }}>
            {group.cloud ? "in tempo reale · apri per i dettagli" : `${count} ${count === 1 ? "spesa" : "spese"} · totale ${formatMinor(total, group.currency)}`}
          </Text>
          <View style={{ marginTop: 8 }}>
            <AvatarStack people={group.memberIds.map((id) => people.get(id)).filter((p): p is NonNullable<typeof p> => !!p)} size={24} max={6} />
          </View>
        </View>
        {!group.cloud ? (
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ color: t.textFaint, fontSize: font.tiny, fontWeight: "700" }}>{mine > 0 ? "TI DEVONO" : mine < 0 ? "DEVI" : "IN PARI"}</Text>
            <Text style={{ color: mine > 0 ? t.positive : mine < 0 ? t.negative : t.textMuted, fontWeight: "800", fontSize: font.h3, fontVariant: ["tabular-nums"] }}>
              {formatMinor(Math.abs(mine), group.currency)}
            </Text>
          </View>
        ) : null}
        <Ionicons name="chevron-forward" size={18} color={t.textFaint} style={{ marginLeft: 6 }} />
      </View>
    </Card>
  );

  return (
    <View style={{ flex: 1 }}>
      <Screen title="Gruppi" subtitle={`${active.length} attivi`} bottomInset={80}>
        {active.length === 0 ? (
          <Card>
            <EmptyState
              icon="people-outline"
              title="Nessun gruppo"
              message="Un gruppo raccoglie spese e persone: una vacanza, i coinquilini, una cena fra amici."
              actionLabel="Crea gruppo"
              onAction={() => router.push("/group/edit")}
            />
          </Card>
        ) : (
          active.map(renderRow)
        )}
        {archived.length > 0 ? (
          <>
            <SectionHeader
              title={`Archiviati (${archived.length})`}
              right={<Button title={showArchived ? "Nascondi" : "Mostra"} size="sm" variant="ghost" onPress={() => setShowArchived((v) => !v)} />}
            />
            {showArchived ? archived.map(renderRow) : null}
          </>
        ) : null}
      </Screen>
      <Fab label="Gruppo" onPress={() => setNewMenu(true)} />
      <PickerSheet<"local" | "cloud">
        visible={newMenu}
        title="Nuovo gruppo"
        items={[
          { value: "local", label: "Gruppo locale", subtitle: "Solo su questo telefono, come sempre", leading: <Ionicons name="phone-portrait-outline" size={22} color={t.text} /> },
          { value: "cloud", label: "Gruppo condiviso", subtitle: "In tempo reale con altre persone", leading: <Ionicons name="cloud-outline" size={22} color={t.text} /> },
        ]}
        onSelect={(v) => router.push(v === "local" ? "/group/edit" : "/group/share-new")}
        onClose={() => setNewMenu(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  emoji: { width: 54, height: 54, borderRadius: 16, alignItems: "center", justifyContent: "center" },
});
