import { Text, type StyleProp, type TextStyle } from "react-native";
import { formatMinor } from "@/domain/money";
import { amountColor, font, useTheme } from "../theme";

type Props = {
  minor: number;
  currency: string;
  signed?: boolean;
  colored?: boolean;
  size?: number;
  weight?: "600" | "700" | "800";
  style?: StyleProp<TextStyle>;
  color?: string;
};

export function Money({ minor, currency, signed, colored, size = font.body, weight = "700", style, color }: Props) {
  const t = useTheme();
  const c = color ?? (colored ? amountColor(minor, t) : t.text);
  return (
    <Text style={[{ color: c, fontSize: size, fontWeight: weight, fontVariant: ["tabular-nums"] }, style]}>
      {formatMinor(minor, currency, { signed })}
    </Text>
  );
}
