import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { formatIsoDate, todayIso } from "@/domain/dates";
import { formatMinor } from "@/domain/money";
import { useExpenses, useGroups, useMyBalancesByGroup, usePeopleMap, useSelf } from "@/store/selectors";
import {
  Avatar,
  AvatarStack,
  Button,
  Card,
  EmptyState,
  ExpenseRow,
  Money,
  PickerSheet,
  Screen,
  SectionHeader,
  Tag,
} from "@/ui/components";
import { font, spacing, useTheme, withAlpha } from "@/ui/theme";

export default function HomeScreen() {
  const router = useRouter();
  const t = useTheme();
  const self = useSelf();
  const people = usePeopleMap();
  const groups = useGroups();
  const expenses = useExpenses();
  const myBalances = useMyBalancesByGroup();
  const [pickGroup, setPickGroup] = useState(false);
  const [pickNewGroupKind, setPickNewGroupKind] = useState(false);

  const activeGroups = useMemo(() => groups.filter((g) => !g.archivedAt), [groups]);
  const groupsById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);

  const totals = useMemo(() => {
    const m = new Map<string, { owed: number; owe: number }>();
    for (const b of myBalances) {
      const e = m.get(b.group.currency) ?? { owed: 0, owe: 0 };
      if (b.netMinor > 0) e.owed += b.netMinor;
      else e.owe += -b.netMinor;
      m.set(b.group.currency, e);
    }
    return [...m.entries()];
  }, [myBalances]);

  const recent = useMemo(
    () => [...expenses].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt.localeCompare(a.createdAt))).slice(0, 8),
    [expenses]
  );

  const startExpense = () => {
    if (activeGroups.length === 0) {
      router.push("/group/edit");
    } else if (activeGroups.length === 1) {
      router.push({ pathname: "/expense/edit", params: { groupId: activeGroups[0].id } });
    } else {
      setPickGroup(true);
    }
  };

  const hour = new Date().getHours();
  const greeting = hour < 6 ? "Buonanotte" : hour < 13 ? "Buongiorno" : hour < 18 ? "Buon pomeriggio" : "Buonasera";

  return (
    <Screen>
      <View style={styles.hero}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.textMuted, fontSize: font.small, fontWeight: "600" }}>{formatIsoDate(todayIso(), "long")}</Text>
          <Text style={{ color: t.text, fontSize: font.h1, fontWeight: "800", letterSpacing: -0.5 }}>
            {greeting}, {self?.name ?? "ciao"}
          </Text>
        </View>
        <Avatar person={self} size={44} />
      </View>

      <Card tone="primary" style={{ marginTop: spacing.lg }}>
        <Text style={{ color: withAlpha("#FFFFFF", 0.75), fontWeight: "700", fontSize: font.small, textTransform: "uppercase", letterSpacing: 0.8 }}>
          Il tuo bilancio
        </Text>
        {totals.length === 0 ? (
          <Text style={{ color: "#fff", fontSize: font.h2, fontWeight: "800", marginTop: 6 }}>Tutto in pari</Text>
        ) : (
          totals.map(([currency, v]) => {
            const net = v.owed - v.owe;
            return (
              <View key={currency} style={{ marginTop: 8 }}>
                <Text style={{ color: "#fff", fontSize: font.display, fontWeight: "800", letterSpacing: -1, fontVariant: ["tabular-nums"] }}>
                  {formatMinor(net, currency, { signed: true })}
                </Text>
                <View style={{ flexDirection: "row", gap: spacing.lg, marginTop: 6 }}>
                  <Text style={{ color: withAlpha("#FFFFFF", 0.85), fontWeight: "600" }}>
                    <Ionicons name="arrow-down-circle" size={13} /> Ti devono {formatMinor(v.owed, currency)}
                  </Text>
                  <Text style={{ color: withAlpha("#FFFFFF", 0.85), fontWeight: "600" }}>
                    <Ionicons name="arrow-up-circle" size={13} /> Devi {formatMinor(v.owe, currency)}
                  </Text>
                </View>
              </View>
            );
          })
        )}
        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg }}>
          <Button title="Nuova spesa" icon="add" variant="secondary" onPress={startExpense} />
          <Button title="Nuovo gruppo" icon="people" variant="onPrimary" onPress={() => setPickNewGroupKind(true)} />
        </View>
      </Card>

      {activeGroups.length === 0 ? (
        <Card>
          <EmptyState
            icon="rocket-outline"
            title="Inizia da un gruppo"
            message="Crea un gruppo (una vacanza, la casa, una cena), aggiungi le persone e registra la prima spesa. Tutto resta sul tuo dispositivo."
            actionLabel="Crea il primo gruppo"
            onAction={() => router.push("/group/edit")}
          />
        </Card>
      ) : (
        <>
          <SectionHeader title="I tuoi gruppi" right={<Button title="Tutti" size="sm" variant="ghost" onPress={() => router.push("/groups")} />} />
          {myBalances.map(({ group, netMinor }) => (
            <Card key={group.id} onPress={() => router.push({ pathname: "/group/[id]", params: { id: group.id } })} padded={false}>
              <View style={styles.groupRow}>
                <View style={[styles.emoji, { backgroundColor: t.surfaceAlt }]}>
                  <Text style={{ fontSize: 22 }}>{group.emoji || "👥"}</Text>
                </View>
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={{ color: t.text, fontWeight: "700", fontSize: font.body, flexShrink: 1 }} numberOfLines={1}>
                      {group.name}
                    </Text>
                    {group.cloud ? <Tag label="condiviso" color={t.primary} /> : null}
                  </View>
                  <View style={{ marginTop: 4 }}>
                    <AvatarStack people={group.memberIds.map((id) => people.get(id)).filter((p): p is NonNullable<typeof p> => !!p)} size={22} />
                  </View>
                </View>
                {!group.cloud ? (
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ color: t.textFaint, fontSize: font.tiny, fontWeight: "700" }}>
                      {netMinor > 0 ? "TI DEVONO" : netMinor < 0 ? "DEVI" : "IN PARI"}
                    </Text>
                    <Money minor={Math.abs(netMinor)} currency={group.currency} colored={false} color={netMinor > 0 ? t.positive : netMinor < 0 ? t.negative : t.textMuted} size={font.h3} weight="800" />
                  </View>
                ) : null}
                <Ionicons name="chevron-forward" size={18} color={t.textFaint} style={{ marginLeft: 6 }} />
              </View>
            </Card>
          ))}
        </>
      )}

      {recent.length > 0 ? (
        <>
          <SectionHeader title="Ultime spese" />
          <Card padded={false}>
            {recent.map((e, i) => (
              <ExpenseRow
                key={e.id}
                expense={e}
                people={people}
                selfId={self?.id}
                groupName={groupsById.get(e.groupId)?.name}
                onPress={() => router.push({ pathname: "/expense/[id]", params: { id: e.id, groupId: e.groupId } })}
                last={i === recent.length - 1}
              />
            ))}
          </Card>
        </>
      ) : null}

      <PickerSheet
        visible={pickGroup}
        title="In quale gruppo?"
        items={activeGroups.map((g) => ({ value: g.id, label: `${g.emoji || "👥"}  ${g.name}`, subtitle: `${g.memberIds.length} persone · ${g.currency}` }))}
        onSelect={(id) => router.push({ pathname: "/expense/edit", params: { groupId: id } })}
        onClose={() => setPickGroup(false)}
      />
      <PickerSheet<"local" | "cloud">
        visible={pickNewGroupKind}
        title="Nuovo gruppo"
        items={[
          { value: "local", label: "Gruppo locale", subtitle: "Solo su questo telefono", leading: <Ionicons name="phone-portrait-outline" size={22} color={t.text} /> },
          { value: "cloud", label: "Gruppo condiviso", subtitle: "In tempo reale con altre persone", leading: <Ionicons name="cloud-outline" size={22} color={t.text} /> },
        ]}
        onSelect={(v) => router.push(v === "local" ? "/group/edit" : "/group/share-new")}
        onClose={() => setPickNewGroupKind(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: "row", alignItems: "center" },
  groupRow: { flexDirection: "row", alignItems: "center", padding: spacing.lg },
  emoji: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
});
