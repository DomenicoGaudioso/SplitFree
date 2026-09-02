import { useState, type ReactNode } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { font, radius, spacing, useTheme } from "../theme";
import { PickerSheet, type PickerItem } from "./PickerSheet";

type Props<T extends string> = {
  label?: string;
  title?: string;
  value: T | null;
  items: PickerItem<T>[];
  onChange: (v: T) => void;
  placeholder?: string;
  leading?: ReactNode;
  compact?: boolean;
};

/** Campo a selezione: apre un foglio con la lista delle opzioni. */
export function SelectField<T extends string>({ label, title, value, items, onChange, placeholder = "Seleziona", leading, compact }: Props<T>) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const current = items.find((i) => i.value === value);
  return (
    <View style={{ marginBottom: compact ? 0 : spacing.md }}>
      {label ? <Text style={[styles.label, { color: t.textMuted }]}>{label}</Text> : null}
      <Pressable
        role="button"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.box, { backgroundColor: t.surfaceAlt, borderColor: t.border, opacity: pressed ? 0.8 : 1, minHeight: compact ? 40 : 48 }]}
      >
        {leading ?? current?.leading ? <View style={{ marginRight: spacing.sm }}>{leading ?? current?.leading}</View> : null}
        <Text style={{ flex: 1, color: current ? t.text : t.textFaint, fontWeight: "600", fontSize: font.body }} numberOfLines={1}>
          {current?.label ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={t.textMuted} />
      </Pressable>
      <PickerSheet visible={open} title={title ?? label ?? "Seleziona"} items={items} value={value} onSelect={onChange} onClose={() => setOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: font.small, fontWeight: "700", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.6 },
  box: { flexDirection: "row", alignItems: "center", borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.md },
});
