import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";
import { radius, useTheme, withAlpha } from "../theme";

type Props = {
  icon: string;
  color: string;
  size?: number;
  rounded?: boolean;
  solid?: boolean;
};

/** Icona su sfondo colorato tenue (categoria/spesa). */
export function IconBadge({ icon, color, size = 44, rounded, solid }: Props) {
  const t = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: rounded ? size / 2 : radius.md,
        backgroundColor: solid ? color : withAlpha(color, t.isDark ? 0.26 : 0.14),
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={size * 0.5} color={solid ? "#fff" : color} />
    </View>
  );
}
