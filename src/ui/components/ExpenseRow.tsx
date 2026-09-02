import { StyleSheet, Text, View } from "react-native";
import { categoryById, iconForExpense } from "@/domain/categories";
import { relativeDateLabel } from "@/domain/dates";
import { formatMinor } from "@/domain/money";
import type { Expense, Person } from "@/domain/types";
import { font, useTheme } from "../theme";
import { IconBadge } from "./IconBadge";
import { ListRow } from "./ListRow";
import { Money } from "./Money";

type Props = {
  expense: Expense;
  people: Map<string, Person>;
  selfId?: string;
  groupName?: string;
  onPress?: () => void;
  last?: boolean;
};

/** Riga di una spesa: icona dedotta dal titolo, chi ha pagato, importo e quota personale. */
export function ExpenseRow({ expense, people, selfId, groupName, onPress, last }: Props) {
  const t = useTheme();
  const cat = categoryById(expense.categoryId);
  const icon = iconForExpense(expense.title, expense.categoryId);
  const payerNames = expense.payers
    .map((p) => people.get(p.personId)?.name ?? "?")
    .map((n, i, arr) => (arr.length > 1 && n.length > 10 ? `${n.slice(0, 9)}…` : n));
  const payerLabel =
    payerNames.length === 0 ? "" : payerNames.length <= 2 ? payerNames.join(" e ") : `${payerNames[0]} +${payerNames.length - 1}`;
  const mine = selfId ? expense.splits.find((s) => s.personId === selfId) : undefined;
  const paidByMe = selfId ? expense.payers.find((p) => p.personId === selfId)?.amountMinor ?? 0 : 0;
  const myNet = paidByMe - (mine?.amountMinor ?? 0);
  const subtitleParts = [relativeDateLabel(expense.date)];
  if (groupName) subtitleParts.push(groupName);
  if (payerLabel) subtitleParts.push(`pagato da ${payerLabel}`);

  return (
    <ListRow
      onPress={onPress}
      last={last}
      leading={<IconBadge icon={icon} color={cat.color} />}
      title={expense.title}
      subtitle={subtitleParts.join(" · ")}
      trailing={
        <View style={styles.trailing}>
          <Money minor={expense.amountMinor} currency={expense.currency} />
          {selfId ? (
            mine || paidByMe ? (
              <Text style={{ color: myNet > 0 ? t.positive : myNet < 0 ? t.negative : t.textFaint, fontSize: font.tiny, fontWeight: "700", marginTop: 2 }}>
                {myNet > 0 ? "ti devono " : myNet < 0 ? "devi " : "in pari "}
                {myNet !== 0 ? formatShort(Math.abs(myNet), expense.currency) : ""}
              </Text>
            ) : (
              <Text style={{ color: t.textFaint, fontSize: font.tiny, marginTop: 2 }}>non coinvolto</Text>
            )
          ) : null}
        </View>
      }
    />
  );
}

function formatShort(minor: number, currency: string): string {
  return formatMinor(minor, currency);
}

const styles = StyleSheet.create({
  trailing: { alignItems: "flex-end" },
});
