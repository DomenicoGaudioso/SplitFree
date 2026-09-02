import { StyleSheet, Text, View } from "react-native";
import type { Person } from "@/domain/types";
import { useTheme, withAlpha } from "../theme";

type Props = {
  person?: Pick<Person, "name" | "color"> | null;
  name?: string;
  color?: string;
  size?: number;
  outline?: boolean;
};

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({ person, name, color, size = 40, outline }: Props) {
  const t = useTheme();
  const n = person?.name ?? name ?? "?";
  const c = person?.color ?? color ?? t.primary;
  return (
    <View
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: withAlpha(c, t.isDark ? 0.28 : 0.16),
          borderColor: outline ? t.surface : "transparent",
          borderWidth: outline ? 2 : 0,
        },
      ]}
    >
      <Text style={{ color: c, fontWeight: "800", fontSize: size * 0.38 }}>{initials(n)}</Text>
    </View>
  );
}

/** Pila di avatar sovrapposti (membri di un gruppo). */
export function AvatarStack({ people, size = 28, max = 4 }: { people: Pick<Person, "name" | "color">[]; size?: number; max?: number }) {
  const t = useTheme();
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {shown.map((p, i) => (
        <View key={i} style={{ marginLeft: i === 0 ? 0 : -size * 0.3 }}>
          <Avatar person={p} size={size} outline />
        </View>
      ))}
      {extra > 0 ? (
        <View
          style={[
            styles.circle,
            { width: size, height: size, borderRadius: size / 2, marginLeft: -size * 0.3, backgroundColor: t.surfaceAlt, borderWidth: 2, borderColor: t.surface },
          ]}
        >
          <Text style={{ color: t.textMuted, fontWeight: "700", fontSize: size * 0.36 }}>+{extra}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: "center", justifyContent: "center" },
});
