import { useEffect, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { isValidIsoDate } from "@/domain/dates";
import type { ImportOptions, ParsedRow } from "@/domain/splitwiseImport";
import { font, radius, spacing, useTheme } from "../theme";
import { Button } from "./Button";
import { Segmented } from "./Segmented";
import { TextField } from "./TextField";

export type SplitwiseParsedSummary = { people: string[]; rows: ParsedRow[]; skipped: number };

type Props = {
  visible: boolean;
  groupCurrency: string;
  parsed: SplitwiseParsedSummary | null;
  /** Cache tassi delle impostazioni (chiavi "EUR>USD"): usata per precompilare i campi tasso. */
  cachedRates: Record<string, { rate: number }>;
  onClose: () => void;
  onConfirm: (options: ImportOptions) => void;
};

type CurrencyMode = "keep" | "convert" | "relabel";

/**
 * Opzioni prima dell'import di un CSV Splitwise: riepilogo del file, filtro
 * "solo dal <data> in poi" e — solo se il file contiene valute diverse da
 * quella del gruppo — la scelta fra mantenere la valuta, convertirla con un
 * tasso di cambio o rietichettarla a parità di numeri.
 */
export function SplitwiseImportModal({ visible, groupCurrency, parsed, cachedRates, onClose, onConfirm }: Props) {
  const t = useTheme();
  const rows = parsed?.rows ?? [];
  const currencies = [...new Set(rows.map((r) => r.currency))];
  const foreign = currencies.filter((c) => c !== groupCurrency);

  const [fromDate, setFromDate] = useState("");
  const [mode, setMode] = useState<CurrencyMode>("keep");
  const [rateText, setRateText] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setFromDate("");
    setMode("keep");
    setError(null);
    const init: Record<string, string> = {};
    for (const r of parsed?.rows ?? []) {
      const cur = r.currency;
      if (cur === groupCurrency || init[cur] !== undefined) continue;
      const cached = cachedRates[`${groupCurrency}>${cur}`]?.rate;
      init[cur] = cached ? String(cached) : "";
    }
    setRateText(init);
    // parsed/cachedRates cambiano insieme a visible: basta ripartire all'apertura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const fromDateTrim = fromDate.trim();
  const fromDateValid = fromDateTrim !== "" && isValidIsoDate(fromDateTrim);
  const countAfterFilter = fromDateValid ? rows.filter((r) => r.date >= fromDateTrim).length : rows.length;

  function handleConfirm() {
    setError(null);
    if (fromDateTrim && !isValidIsoDate(fromDateTrim)) {
      setError("Data non valida: usa il formato AAAA-MM-GG (es. 2025-01-01).");
      return;
    }
    let rates: Record<string, number> | undefined;
    if (mode === "convert") {
      rates = {};
      for (const cur of foreign) {
        const v = Number((rateText[cur] ?? "").trim().replace(",", "."));
        if (!Number.isFinite(v) || v <= 0) {
          setError(`Inserisci un tasso valido per ${cur}: quante ${cur} vale 1 ${groupCurrency}.`);
          return;
        }
        rates[cur] = v;
      }
    }
    onConfirm({ fromDate: fromDateTrim || undefined, currencyMode: mode, rates });
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: t.surface, borderColor: t.border }]} onPress={(e) => e.stopPropagation()}>
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.header}>
              <View style={[styles.iconBox, { backgroundColor: t.primary + "18" }]}>
                <Ionicons name="download-outline" size={28} color={t.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: t.text }]}>Importa da Splitwise</Text>
                <Text style={[styles.subtitle, { color: t.textMuted }]}>
                  {rows.length} {rows.length === 1 ? "spesa trovata" : "spese trovate"} · {parsed?.people.length ?? 0}{" "}
                  {(parsed?.people.length ?? 0) === 1 ? "persona" : "persone"} ·{" "}
                  {currencies.length === 1 ? `valuta: ${currencies[0]}` : `valute: ${currencies.join(", ")}`}
                  {parsed && parsed.skipped > 0 ? ` · ${parsed.skipped} righe già saltate` : ""}
                </Text>
              </View>
            </View>

            <View style={styles.section}>
              <TextField
                label="Importa solo dal (opzionale)"
                value={fromDate}
                onChangeText={setFromDate}
                placeholder="AAAA-MM-GG"
                autoCapitalize="none"
                autoCorrect={false}
                error={fromDateTrim && !fromDateValid ? "Data non valida" : null}
              />
              {fromDateValid && countAfterFilter < rows.length ? (
                <Text style={[styles.note, { color: t.textMuted }]}>
                  Verranno importate {countAfterFilter} spese su {rows.length} ({rows.length - countAfterFilter} precedenti saltate).
                </Text>
              ) : null}

              {foreign.length > 0 ? (
                <View style={{ gap: spacing.sm }}>
                  <Text style={[styles.label, { color: t.textMuted }]}>
                    {foreign.length === 1
                      ? `Il file è in ${foreign[0]} ma il gruppo è in ${groupCurrency}.`
                      : `Il file contiene valute estere (${foreign.join(", ")}); il gruppo è in ${groupCurrency}.`}
                  </Text>
                  <Segmented<CurrencyMode>
                    options={[
                      { value: "keep", label: "Mantieni" },
                      { value: "convert", label: `Converti in ${groupCurrency}` },
                      { value: "relabel", label: "A numero" },
                    ]}
                    value={mode}
                    onChange={setMode}
                  />
                  {mode === "convert"
                    ? foreign.map((cur) => (
                        <TextField
                          key={cur}
                          label={`Tasso: 1 ${groupCurrency} = … ${cur}`}
                          value={rateText[cur] ?? ""}
                          onChangeText={(s) => setRateText((prev) => ({ ...prev, [cur]: s }))}
                          placeholder={cachedRates[`${groupCurrency}>${cur}`]?.rate ? String(cachedRates[`${groupCurrency}>${cur}`].rate) : "es. 1,08"}
                          keyboardType="decimal-pad"
                        />
                      ))
                    : null}
                  {mode === "relabel" ? (
                    <Text style={[styles.note, { color: t.textMuted }]}>
                      Gli importi restano identici come numeri: cambia solo l'etichetta valuta ({foreign.join(", ")} → {groupCurrency}).
                    </Text>
                  ) : null}
                </View>
              ) : null}

              {error ? <Text style={[styles.errorText, { color: t.negative }]}>{error}</Text> : null}

              <Button
                title={countAfterFilter === 1 ? "Importa 1 spesa" : `Importa ${countAfterFilter} spese`}
                icon="checkmark"
                size="lg"
                onPress={handleConfirm}
                disabled={countAfterFilter === 0}
                style={styles.primaryBtn}
              />
              <Button title="Annulla" variant="ghost" size="md" onPress={onClose} />
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.md,
  },
  sheet: {
    width: "100%",
    maxWidth: 460,
    borderRadius: radius.lg,
    borderWidth: 1,
    maxHeight: "90%",
    ...Platform.select({
      web: { boxShadow: "0 8px 30px rgba(0,0,0,0.22)" },
      default: { elevation: 8 },
    }),
  },
  scrollContent: { padding: spacing.lg },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.md },
  iconBox: { width: 48, height: 48, borderRadius: radius.md, justifyContent: "center", alignItems: "center" },
  title: { fontSize: font.h2, fontWeight: "700" },
  subtitle: { fontSize: font.small, lineHeight: 18, marginTop: 2 },
  section: { gap: spacing.md },
  label: { fontSize: font.small, fontWeight: "600", lineHeight: 18 },
  note: { fontSize: font.tiny, lineHeight: 16 },
  errorText: { fontSize: font.small, lineHeight: 18 },
  primaryBtn: { marginTop: spacing.xs },
});
