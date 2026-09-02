import { Ionicons } from "@expo/vector-icons";
import { Platform, Pressable, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { font, radius, shadow, spacing, useTheme } from "../theme";

export function Fab({ label, icon = "add", onPress }: { label?: string; icon?: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      role="button"
      onPress={onPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.fab,
        { backgroundColor: t.primary, bottom: spacing.lg + (Platform.OS === "web" ? 0 : insets.bottom), opacity: pressed ? 0.85 : hovered ? 0.95 : 1 },
        shadow(t.primary, 0.35, 20, 6, 6),
        label ? { paddingHorizontal: spacing.lg } : { width: 56 },
      ]}
    >
      <Ionicons name={icon} size={24} color={t.onPrimary} />
      {label ? <Text style={{ color: t.onPrimary, fontWeight: "800", fontSize: font.body, marginLeft: 6 }}>{label}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    right: spacing.lg,
    height: 56,
    borderRadius: radius.pill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
});
