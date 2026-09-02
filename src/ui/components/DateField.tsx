import { useEffect, useState } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { addDays, isoToItalian, italianToIso, todayIso } from "@/domain/dates";
import { useTheme } from "../theme";
import { Chip } from "./Chip";
import { TextField } from "./TextField";

type Props = {
  label?: string;
  value: string; // ISO
  onChange: (iso: string) => void;
};

/** Campo data "gg/mm/aaaa" con scorciatoie Oggi / Ieri, valido su tutte le piattaforme. */
export function DateField({ label = "Data", value, onChange }: Props) {
  const t = useTheme();
  const [text, setText] = useState(isoToItalian(value));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(isoToItalian(value));
  }, [value]);

  const commit = (s: string) => {
    const iso = italianToIso(s);
    if (iso) {
      setError(null);
      onChange(iso);
    } else {
      setError("Data non valida (gg/mm/aaaa)");
    }
  };

  const today = todayIso();
  return (
    <View>
      <TextField
        label={label}
        value={text}
        onChangeText={(s) => {
          setText(s);
          if (italianToIso(s)) {
            setError(null);
            onChange(italianToIso(s)!);
          }
        }}
        onBlur={() => commit(text)}
        placeholder="gg/mm/aaaa"
        keyboardType="numbers-and-punctuation"
        error={error}
        prefix={<Ionicons name="calendar-outline" size={18} color={t.textMuted} />}
        containerStyle={{ marginBottom: 8 }}
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        <Chip label="Oggi" small selected={value === today} onPress={() => onChange(today)} />
        <Chip label="Ieri" small selected={value === addDays(today, -1)} onPress={() => onChange(addDays(today, -1))} />
        <Chip label="−1 giorno" small onPress={() => onChange(addDays(value, -1))} />
        <Chip label="+1 giorno" small onPress={() => onChange(addDays(value, 1))} />
      </View>
    </View>
  );
}
