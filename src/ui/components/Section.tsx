import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { font, spacing, useTheme } from "../theme";

export function SectionHeader({ title, right, first }: { title: string; right?: ReactNode; first?: boolean }) {
  const t = useTheme();
  return (
    <View style={[styles.row, first && { marginTop: 0 }]}>
      <Text style={[styles.title, { color: t.textMuted }]}>{title}</Text>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.lg, marginBottom: spacing.sm },
  title: { fontSize: font.small, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8 },
});
