import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text } from "react-native";
import { font, radius, spacing, useTheme, withAlpha } from "../theme";

type Props = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  color?: string;
  small?: boolean;
};

export function Chip({ label, selected, onPress, icon, color, small }: Props) {
  const t = useTheme();
  const accent = color ?? t.primary;
  return (
    <Pressable
      role="button"
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? accent : t.surfaceAlt,
          borderColor: selected ? accent : t.border,
          opacity: pressed ? 0.8 : 1,
          paddingVertical: small ? 4 : 8,
          paddingHorizontal: small ? 10 : 14,
        },
      ]}
    >
      {icon ? (
        <Ionicons name={icon} size={small ? 13 : 15} color={selected ? "#fff" : accent} style={{ marginRight: 6 }} />
      ) : null}
      <Text style={{ color: selected ? "#fff" : t.text, fontWeight: "600", fontSize: small ? font.tiny + 1 : font.small }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Tag({ label, color }: { label: string; color: string }) {
  const t = useTheme();
  return (
    <Text
      style={{
        backgroundColor: withAlpha(color, t.isDark ? 0.28 : 0.14),
        color,
        fontSize: font.tiny,
        fontWeight: "800",
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: radius.pill,
        overflow: "hidden",
        textTransform: "uppercase",
        letterSpacing: 0.5,
      }}
    >
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
});
