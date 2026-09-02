import type { ReactNode } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Overlay } from "./Overlay";
import { font, radius, spacing, useTheme } from "../theme";

export type PickerItem<T extends string> = {
  value: T;
  label: string;
  subtitle?: string;
  leading?: ReactNode;
};

type Props<T extends string> = {
  visible: boolean;
  title: string;
  items: PickerItem<T>[];
  value?: T | null;
  onSelect: (value: T) => void;
  onClose: () => void;
};

/** Selettore a lista in un foglio modale (funziona su Android, iOS e web). */
export function PickerSheet<T extends string>({ visible, title, items, value, onSelect, onClose }: Props<T>) {
  const t = useTheme();
  return (
    <Overlay visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: t.surface }]} onPress={() => undefined}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: t.text }]}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={t.textMuted} />
            </Pressable>
          </View>
          <ScrollView style={{ maxHeight: 420 }}>
            {items.map((it) => {
              const active = it.value === value;
              return (
                <Pressable
                  key={it.value}
                  role="button"
                  onPress={() => {
                    onSelect(it.value);
                    onClose();
                  }}
                  style={({ pressed }) => [styles.item, { backgroundColor: active ? t.primarySoft : pressed ? t.surfaceAlt : "transparent" }]}
                >
                  {it.leading ? <View style={{ marginRight: spacing.md }}>{it.leading}</View> : null}
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: t.text, fontWeight: active ? "800" : "600", fontSize: font.body }}>{it.label}</Text>
                    {it.subtitle ? <Text style={{ color: t.textMuted, fontSize: font.small }}>{it.subtitle}</Text> : null}
                  </View>
                  {active ? <Ionicons name="checkmark-circle" size={20} color={t.primary} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Overlay>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(2, 6, 23, 0.55)", justifyContent: "flex-end", alignItems: "center" },
  sheet: {
    width: "100%",
    maxWidth: 560,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: spacing.xl,
    paddingTop: spacing.md,
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  title: { fontSize: font.h3, fontWeight: "800" },
  item: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: spacing.xl },
});
