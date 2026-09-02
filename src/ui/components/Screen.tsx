import type { ReactNode } from "react";
import { Platform, ScrollView, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { font, spacing, useTheme } from "../theme";

type Props = {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  style?: ViewStyle;
  bottomInset?: number;
};

const MAX_WIDTH = 720;

/** Contenitore di pagina: sfondo, safe area, larghezza massima su desktop. */
export function Screen({ children, title, subtitle, right, scroll = true, padded = true, style, bottomInset = 0 }: Props) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const content = (
    <View style={[styles.inner, padded && { paddingHorizontal: spacing.lg }, style]}>
      {title ? (
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: t.text }]}>{title}</Text>
            {subtitle ? <Text style={[styles.subtitle, { color: t.textMuted }]}>{subtitle}</Text> : null}
          </View>
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
  if (!scroll) {
    return <View style={[styles.root, { backgroundColor: t.bg }]}>{content}</View>;
  }
  return (
    <ScrollView
      style={[styles.root, { backgroundColor: t.bg }]}
      contentContainerStyle={{ paddingBottom: spacing.xxl + bottomInset + (Platform.OS === "web" ? 0 : insets.bottom) }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={Platform.OS === "web"}
    >
      {content}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  inner: { width: "100%", maxWidth: MAX_WIDTH, alignSelf: "center", paddingTop: spacing.lg },
  titleRow: { flexDirection: "row", alignItems: "flex-end", marginBottom: spacing.lg, gap: spacing.md },
  title: { fontSize: font.h1, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { fontSize: font.body, marginTop: 2 },
});
