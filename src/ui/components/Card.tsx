import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { radius, shadow, spacing, useTheme } from "../theme";

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  padded?: boolean;
  tone?: "surface" | "alt" | "primary";
};

export function Card({ children, style, onPress, padded = true, tone = "surface" }: Props) {
  const t = useTheme();
  const bg = tone === "primary" ? t.primary : tone === "alt" ? t.surfaceAlt : t.surface;
  const base = [
    styles.card,
    { backgroundColor: bg, borderColor: t.border },
    shadow(t.shadow, t.isDark ? 0.35 : 0.06, 16, 4),
    padded && { padding: spacing.lg },
    style,
  ];
  if (onPress) {
    return (
      <Pressable
        role="button"
        onPress={onPress}
        style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
          base,
          (pressed || hovered) && { opacity: 0.92 },
        ]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={base}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.md,
  },
});
