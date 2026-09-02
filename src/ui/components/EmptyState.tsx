import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { font, spacing, useTheme, withAlpha } from "../theme";
import { Button } from "./Button";

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({ icon, title, message, actionLabel, onAction }: Props) {
  const t = useTheme();
  return (
    <View style={styles.wrap}>
      <View style={[styles.iconWrap, { backgroundColor: withAlpha(t.primary, t.isDark ? 0.25 : 0.1) }]}>
        <Ionicons name={icon} size={30} color={t.primary} />
      </View>
      <Text style={[styles.title, { color: t.text }]}>{title}</Text>
      {message ? <Text style={[styles.message, { color: t.textMuted }]}>{message}</Text> : null}
      {actionLabel && onAction ? <Button title={actionLabel} onPress={onAction} style={{ marginTop: spacing.lg }} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", paddingVertical: spacing.xxl, paddingHorizontal: spacing.xl },
  iconWrap: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", marginBottom: spacing.lg },
  title: { fontSize: font.h3, fontWeight: "800", textAlign: "center" },
  message: { fontSize: font.body, textAlign: "center", marginTop: spacing.sm, lineHeight: 22 },
});
