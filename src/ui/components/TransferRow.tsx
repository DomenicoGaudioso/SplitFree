import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import type { Person, Transfer } from "@/domain/types";
import { font, spacing, useTheme } from "../theme";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { Money } from "./Money";

type Props = {
  transfer: Transfer;
  people: Map<string, Person>;
  currency: string;
  selfId?: string;
  onSettle?: () => void;
  last?: boolean;
};

/** "A deve dare X a B" con azione di registrazione del rimborso. */
export function TransferRow({ transfer, people, currency, selfId, onSettle, last }: Props) {
  const t = useTheme();
  const from = people.get(transfer.fromPersonId);
  const to = people.get(transfer.toPersonId);
  const involvesMe = selfId === transfer.fromPersonId || selfId === transfer.toPersonId;
  return (
    <View style={[styles.row, { borderBottomColor: t.border, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth }]}>
      <View style={styles.avatars}>
        <Avatar person={from} size={34} />
        <Ionicons name="arrow-forward" size={16} color={t.textFaint} style={{ marginHorizontal: 4 }} />
        <Avatar person={to} size={34} />
      </View>
      <View style={{ flex: 1, marginLeft: spacing.md }}>
        <Text style={{ color: t.text, fontWeight: "700", fontSize: font.body }} numberOfLines={1}>
          {selfId === transfer.fromPersonId ? "Tu" : from?.name ?? "?"}
          <Text style={{ color: t.textMuted, fontWeight: "500" }}> {selfId === transfer.fromPersonId ? "devi dare a" : "deve dare a"} </Text>
          {selfId === transfer.toPersonId ? "te" : to?.name ?? "?"}
        </Text>
        <Money minor={transfer.amountMinor} currency={currency} size={font.h3} weight="800" color={involvesMe ? (selfId === transfer.toPersonId ? t.positive : t.negative) : t.text} />
      </View>
      {onSettle ? <Button title="Salda" size="sm" variant="secondary" icon="checkmark" onPress={onSettle} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  avatars: { flexDirection: "row", alignItems: "center" },
});
