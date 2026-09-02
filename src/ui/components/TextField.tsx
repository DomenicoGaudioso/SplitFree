import type { ReactNode } from "react";
import { StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from "react-native";
import { font, radius, spacing, useTheme } from "../theme";

type Props = TextInputProps & {
  label?: string;
  error?: string | null;
  hint?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  large?: boolean;
};

export function TextField({ label, error, hint, prefix, suffix, containerStyle, large, style, ...rest }: Props) {
  const t = useTheme();
  return (
    <View style={[styles.wrap, containerStyle]}>
      {label ? <Text style={[styles.label, { color: t.textMuted }]}>{label}</Text> : null}
      <View
        style={[
          styles.box,
          { backgroundColor: t.surfaceAlt, borderColor: error ? t.negative : t.border },
          large && { height: 64 },
        ]}
      >
        {prefix ? <View style={styles.affix}>{prefix}</View> : null}
        <TextInput
          placeholderTextColor={t.textFaint}
          {...rest}
          style={[
            styles.input,
            { color: t.text, fontSize: large ? font.h1 : font.body, fontWeight: large ? "800" : "500" },
            style,
          ]}
        />
        {suffix ? <View style={styles.affix}>{suffix}</View> : null}
      </View>
      {error ? (
        <Text style={[styles.hint, { color: t.negative }]}>{error}</Text>
      ) : hint ? (
        <Text style={[styles.hint, { color: t.textFaint }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  label: { fontSize: font.small, fontWeight: "700", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.6 },
  box: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  // minWidth 0: su web l'input ha una larghezza intrinseca e altrimenti sborda dal contenitore.
  input: { flex: 1, minWidth: 0, width: "100%", paddingVertical: 10, outlineStyle: "none" } as object,
  affix: { marginHorizontal: 4 },
  hint: { fontSize: font.small, marginTop: 6 },
});
