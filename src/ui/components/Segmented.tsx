import { Pressable, StyleSheet, Text, View } from "react-native";
import { font, radius, shadow, useTheme } from "../theme";

type Option<T extends string> = { value: T; label: string };

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  const t = useTheme();
  return (
    <View style={[styles.wrap, { backgroundColor: t.surfaceAlt, borderColor: t.border }]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            role="button"
            style={[styles.item, active && { backgroundColor: t.surface }, active && shadow(t.shadow, 0.12, 6, 1, 1)]}
          >
            <Text style={{ color: active ? t.text : t.textMuted, fontWeight: "700", fontSize: font.small }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", borderRadius: radius.md, padding: 4, borderWidth: 1, marginBottom: 12 },
  item: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: radius.sm,
  },
});
