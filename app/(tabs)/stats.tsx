import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { categoryById } from "@/domain/categories";
import { monthLabel } from "@/domain/dates";
import { formatMinor } from "@/domain/money";
import { computeStats } from "@/domain/stats";
import { useStore } from "@/store/store";
import { useExpenses, useGroups, usePeopleMap, useSelf } from "@/store/selectors";
import { AreaChart, Avatar, Card, Chip, DonutChart, EmptyState, IconBadge, ProgressBar, Screen, SectionHeader, Segmented } from "@/ui/components";
import { font, spacing, useTheme } from "@/ui/theme";

type Period = "3" | "6" | "12";
type Mode = "total" | "mine";

export default function StatsScreen() {
  const t = useTheme();
  const groups = useGroups();
  const expenses = useExpenses();
  const people = usePeopleMap();
  const self = useSelf();
  const settings = useStore((s) => s.data.settings);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("6");
  const [mode, setMode] = useState<Mode>("total");
  const [chartWidth, setChartWidth] = useState(0);

  const selectedGroup = groups.find((g) => g.id === groupId);
  const currency = selectedGroup?.currency ?? settings.defaultCurrency;

  const stats = useMemo(
    () =>
      computeStats(expenses, groups, {
        currency,
        rates: settings.rates,
        selfId: self?.id ?? null,
        months: Number(period),
        groupId,
      }),
    [expenses, groups, currency, settings.rates, self, period, groupId]
  );

  const monthly = stats.monthly.map((m) => ({ label: monthLabel(m.month), value: mode === "mine" ? m.mineMinor : m.totalMinor }));
  const secondary = mode === "total" && self ? stats.monthly.map((m) => ({ label: monthLabel(m.month), value: m.mineMinor })) : undefined;
  const headline = mode === "mine" ? stats.mineMinor : stats.totalMinor;
  const slices = stats.categories.map((c) => {
    const cat = categoryById(c.categoryId);
    return { value: mode === "mine" ? c.mineMinor : c.totalMinor, color: cat.color, label: cat.name };
  }).filter((s) => s.value > 0);

  const activeGroups = groups.filter((g) => !g.archivedAt);

  return (
    <Screen title="Statistiche" subtitle="Andamento e ripartizione delle spese">
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        <Chip label="Tutti i gruppi" selected={groupId === null} onPress={() => setGroupId(null)} />
        {activeGroups.map((g) => (
          <Chip key={g.id} label={`${g.emoji || "👥"} ${g.name}`} selected={groupId === g.id} onPress={() => setGroupId(g.id)} />
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Segmented<Period> options={[{ value: "3", label: "3 mesi" }, { value: "6", label: "6 mesi" }, { value: "12", label: "12 mesi" }]} value={period} onChange={setPeriod} />
        </View>
        <View style={{ flex: 1 }}>
          <Segmented<Mode> options={[{ value: "total", label: "Totale" }, { value: "mine", label: "La mia quota" }]} value={mode} onChange={setMode} />
        </View>
      </View>

      {stats.count === 0 ? (
        <Card>
          <EmptyState icon="pie-chart-outline" title="Ancora niente da mostrare" message="Le statistiche compaiono quando registri le prime spese nel periodo selezionato." />
        </Card>
      ) : (
        <>
          <Card>
            <Text style={[styles.label, { color: t.textFaint }]}>{mode === "mine" ? "La tua quota" : "Spesa totale"} · ultimi {period} mesi</Text>
            <Text style={{ color: t.text, fontSize: font.display, fontWeight: "800", letterSpacing: -1, fontVariant: ["tabular-nums"] }}>{formatMinor(headline, currency)}</Text>
            <View style={{ flexDirection: "row", gap: spacing.xl, marginTop: 6 }}>
              <Text style={{ color: t.textMuted, fontSize: font.small }}>
                <Text style={{ fontWeight: "800", color: t.text }}>{stats.count}</Text> spese
              </Text>
              <Text style={{ color: t.textMuted, fontSize: font.small }}>
                media <Text style={{ fontWeight: "800", color: t.text }}>{formatMinor(stats.averageMinor, currency)}</Text>
              </Text>
              {mode === "total" && self ? (
                <Text style={{ color: t.textMuted, fontSize: font.small }}>
                  tua quota <Text style={{ fontWeight: "800", color: t.text }}>{formatMinor(stats.mineMinor, currency)}</Text>
                </Text>
              ) : null}
            </View>
            <View style={{ marginTop: spacing.lg }} onLayout={(e) => setChartWidth(e.nativeEvent.layout.width)}>
              {chartWidth > 0 ? <AreaChart series={monthly} secondary={secondary} width={chartWidth} formatValue={(v) => formatMinor(v, currency)} /> : null}
            </View>
            {mode === "total" && self ? (
              <View style={{ flexDirection: "row", gap: spacing.lg, marginTop: 4 }}>
                <Legend color={t.primary} label="Totale gruppo" />
                <Legend color={t.positive} label="La tua quota" dashed />
              </View>
            ) : null}
            {stats.skippedForCurrency > 0 ? (
              <Text style={{ color: t.warning, fontSize: font.tiny, marginTop: 8 }}>
                {stats.skippedForCurrency} spese in gruppi con altra valuta non sono incluse (manca un tasso in cache verso {currency}).
              </Text>
            ) : null}
          </Card>

          <SectionHeader title="Per categoria" />
          <Card>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.lg }}>
              <DonutChart slices={slices} size={150} thickness={20} centerTitle={`${stats.categories.length}`} centerSubtitle={stats.categories.length === 1 ? "categoria" : "categorie"} />
              <View style={{ flex: 1 }}>
                {stats.categories.slice(0, 5).map((c) => {
                  const cat = categoryById(c.categoryId);
                  const v = mode === "mine" ? c.mineMinor : c.totalMinor;
                  const ratio = headline > 0 ? v / headline : 0;
                  return (
                    <View key={c.categoryId} style={{ marginBottom: 8 }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
                        <Text style={{ color: t.text, fontSize: font.small, fontWeight: "700" }} numberOfLines={1}>{cat.name}</Text>
                        <Text style={{ color: t.textMuted, fontSize: font.small }}>{Math.round(ratio * 100)}%</Text>
                      </View>
                      <ProgressBar ratio={ratio} color={cat.color} />
                    </View>
                  );
                })}
              </View>
            </View>
            <View style={{ marginTop: spacing.md }}>
              {stats.categories.map((c, i) => {
                const cat = categoryById(c.categoryId);
                const v = mode === "mine" ? c.mineMinor : c.totalMinor;
                return (
                  <View key={c.categoryId} style={[styles.catRow, { borderTopColor: t.border, borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth }]}>
                    <IconBadge icon={cat.icon} color={cat.color} size={36} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={{ color: t.text, fontWeight: "700" }}>{cat.name}</Text>
                      <Text style={{ color: t.textMuted, fontSize: font.small }}>{c.count} {c.count === 1 ? "spesa" : "spese"}</Text>
                    </View>
                    <Text style={{ color: t.text, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{formatMinor(v, currency)}</Text>
                  </View>
                );
              })}
            </View>
          </Card>

          <SectionHeader title="Per persona" />
          <Card>
            {stats.people.map((p, i) => {
              const person = people.get(p.personId);
              return (
                <View key={p.personId} style={[styles.catRow, { borderTopColor: t.border, borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth }]}>
                  <Avatar person={person} size={36} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={{ color: t.text, fontWeight: "700" }}>{person?.isSelf ? `${person.name} (tu)` : person?.name ?? "?"}</Text>
                    <Text style={{ color: t.textMuted, fontSize: font.small }}>ha pagato {formatMinor(p.paidMinor, currency)} · {Math.round(p.share * 100)}% del totale</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ color: t.text, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{formatMinor(p.owedMinor, currency)}</Text>
                    <Text style={{ color: t.textFaint, fontSize: font.tiny }}>quota</Text>
                  </View>
                </View>
              );
            })}
          </Card>
        </>
      )}
    </Screen>
  );
}

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ width: 18, height: 0, borderTopWidth: 2.5, borderColor: color, borderStyle: dashed ? "dashed" : "solid" }} />
      <Text style={{ color: t.textMuted, fontSize: font.tiny }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: font.tiny, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 },
  catRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10 },
});
