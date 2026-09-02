import type { ReactNode } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { font, spacing, useTheme } from "../theme";

type Props = {
  leading?: ReactNode;
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  last?: boolean;
};

export function ListRow({ leading, title, subtitle, trailing, onPress, chevron, last }: Props) {
  const t = useTheme();
  return (
    <Pressable
      role={onPress ? "button" : undefined}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.row,
        { borderBottomColor: t.border, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth },
        (pressed || hovered) && onPress ? { backgroundColor: t.surfaceAlt } : null,
      ]}
    >
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.body}>
        <Text style={[styles.title, { color: t.text }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: t.textMuted }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      {chevron ? <Ionicons name="chevron-forward" size={18} color={t.textFaint} style={{ marginLeft: 4 }} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  leading: { marginRight: spacing.md },
  body: { flex: 1, minWidth: 0 },
  title: { fontSize: font.body, fontWeight: "600" },
  subtitle: { fontSize: font.small, marginTop: 2 },
  trailing: { marginLeft: spacing.md, alignItems: "flex-end" },
});
