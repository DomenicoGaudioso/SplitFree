import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";
import { font, radius, spacing, useTheme } from "../theme";

type Props = {
  title: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "positive" | "onPrimary";
  size?: "sm" | "md" | "lg";
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  fullWidth?: boolean;
};

export function Button({ title, onPress, variant = "primary", size = "md", icon, disabled, loading, style, fullWidth }: Props) {
  const t = useTheme();
  const palette = {
    primary: { bg: t.primary, fg: t.onPrimary, border: t.primary },
    secondary: { bg: t.surfaceAlt, fg: t.text, border: t.border },
    ghost: { bg: "transparent", fg: t.primary, border: "transparent" },
    danger: { bg: t.negativeSoft, fg: t.negative, border: t.negativeSoft },
    positive: { bg: t.positiveSoft, fg: t.positive, border: t.positiveSoft },
    onPrimary: { bg: "transparent", fg: "#FFFFFF", border: "rgba(255,255,255,0.45)" },
  }[variant];
  const height = size === "sm" ? 36 : size === "lg" ? 54 : 46;
  const textSize = size === "sm" ? font.small : size === "lg" ? font.h3 : font.body;
  const isDisabled = disabled || loading;
  return (
    <Pressable
      role="button"
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.base,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          height,
          paddingHorizontal: size === "sm" ? spacing.md : spacing.xl,
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : hovered ? 0.92 : 1,
        },
        fullWidth && { alignSelf: "stretch" },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={textSize + 3} color={palette.fg} style={{ marginRight: spacing.sm }} /> : null}
          <Text style={{ color: palette.fg, fontSize: textSize, fontWeight: "700" }}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
});
