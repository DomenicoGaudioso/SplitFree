import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { todayIso } from "@/domain/dates";
import { currencyInfo, formatPlain, parseAmount } from "@/domain/money";
import { useStore } from "@/store/store";
import { useGroup, usePeopleMap, useSelf } from "@/store/selectors";
import { Avatar, Button, Card, DateField, Screen, SelectField, TextField } from "@/ui/components";
import { font, spacing, useTheme } from "@/ui/theme";

export default function SettleScreen() {
  const params = useLocalSearchParams<{ groupId: string; from?: string; to?: string; amount?: string }>();
  const router = useRouter();
  const t = useTheme();
  const group = useGroup(params.groupId);
  const people = usePeopleMap();
  const self = useSelf();
  const addSettlement = useStore((s) => s.addSettlement);

  const members = useMemo(() => (group ? group.memberIds.map((m) => people.get(m)).filter((p): p is NonNullable<typeof p> => !!p) : []), [group, people]);
  const [from, setFrom] = useState<string | null>(params.from ?? (self && group?.memberIds.includes(self.id) ? self.id : null));
  const [to, setTo] = useState<string | null>(params.to ?? null);
  const [amountText, setAmountText] = useState(params.amount && group ? formatPlain(Number(params.amount), group.currency) : "");
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!group) {
    return (
      <Screen>
        <Text style={{ color: t.text }}>Gruppo non trovato.</Text>
      </Screen>
    );
  }

  const items = members.map((p) => ({ value: p.id, label: p.isSelf ? `${p.name} (tu)` : p.name, leading: <Avatar person={p} size={28} /> }));

  const save = () => {
    const minor = parseAmount(amountText, group.currency);
    if (!from || !to) return setError("Scegli chi paga e chi riceve.");
    if (from === to) return setError("Le due persone devono essere diverse.");
    if (minor === null || minor <= 0) return setError("Inserisci un importo valido.");
    addSettlement({ groupId: group.id, fromPersonId: from, toPersonId: to, amountMinor: minor, date, note: note.trim() });
    router.back();
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: "Registra rimborso" }} />
      <Card>
        <SelectField label="Chi paga" value={from} items={items} onChange={setFrom} />
        <SelectField label="Chi riceve" value={to} items={items} onChange={setTo} />
        <TextField
          label={`Importo (${group.currency})`}
          value={amountText}
          onChangeText={setAmountText}
          placeholder="0,00"
          keyboardType="decimal-pad"
          large
          prefix={<Text style={{ color: t.textMuted, fontSize: font.h2, fontWeight: "700" }}>{currencyInfo(group.currency).symbol}</Text>}
        />
        <DateField value={date} onChange={setDate} />
        <View style={{ height: spacing.md }} />
        <TextField label="Nota (facoltativa)" value={note} onChangeText={setNote} placeholder="Es. bonifico, contanti" />
        {error ? <Text style={{ color: t.negative, marginBottom: spacing.sm }}>{error}</Text> : null}
      </Card>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Button title="Registra" icon="checkmark" size="lg" onPress={save} style={{ flex: 1 }} />
        <Button title="Annulla" variant="secondary" size="lg" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
