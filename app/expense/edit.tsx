import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { CATEGORIES, categoryById, guessFromTitle } from "@/domain/categories";
import { todayIso } from "@/domain/dates";
import { CURRENCIES, currencyInfo, formatMinor, formatPlain, parseAmount } from "@/domain/money";
import { computeSplits, validatePayments, type SplitParticipant } from "@/domain/split";
import type { Attachment, SplitMethod } from "@/domain/types";
import { deleteAttachmentFile, saveAttachment } from "@/store/attachments";
import { useGroupActions } from "@/store/groupActions";
import { uuid } from "@/store/ids";
import { fetchRate, rateKey } from "@/store/rates";
import { useStore, type ExpenseInput } from "@/store/store";
import { useExpenseAttachments, useResolvedGroup, useSelf } from "@/store/selectors";
import {
  AttachmentThumb,
  Avatar,
  Button,
  Card,
  Chip,
  DateField,
  IconBadge,
  Screen,
  SectionHeader,
  Segmented,
  SelectField,
  TextField,
  type ThumbSource,
} from "@/ui/components";
import { notify } from "@/ui/dialogs";
import { font, radius, spacing, useTheme } from "@/ui/theme";

type PayerMode = "single" | "multiple";

type Pending = { key: string; sourceUri: string; fileName: string; mimeType: string; width: number | null; height: number | null };

export default function ExpenseEditScreen() {
  const params = useLocalSearchParams<{ groupId?: string; id?: string }>();
  const router = useRouter();
  const t = useTheme();
  const resolved = useResolvedGroup(params.groupId);
  const { group, people, authUser } = resolved;
  const existing = params.id ? resolved.expenses.find((e) => e.id === params.id) : undefined;
  const self = useSelf();
  const meId = group?.cloud ? authUser?.uid : self?.id;
  const actions = useGroupActions(group);
  const rates = useStore((s) => s.data.settings.rates);
  const addAttachment = useStore((s) => s.addAttachment);
  const removeAttachment = useStore((s) => s.removeAttachment);
  const cacheRate = useStore((s) => s.cacheRate);
  const existingAttachments = useExpenseAttachments(existing?.id);

  const members = useMemo(() => (group ? group.memberIds.map((m) => people.get(m)).filter((p): p is NonNullable<typeof p> => !!p) : []), [group, people]);

  // ----- stato del form -----
  const [amountText, setAmountText] = useState(existing ? formatPlain(existing.amountMinor, existing.currency) : "");
  const [title, setTitle] = useState(existing?.title ?? "");
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? "other");
  const [categoryTouched, setCategoryTouched] = useState(!!existing);
  const [date, setDate] = useState(existing?.date ?? todayIso());
  const [currency, setCurrency] = useState(existing?.currency ?? group?.currency ?? "EUR");
  const [rateText, setRateText] = useState(existing ? String(existing.exchangeRate) : "1");
  const [rateBusy, setRateBusy] = useState(false);
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [payerMode, setPayerMode] = useState<PayerMode>(existing && (existing.payers?.length ?? 0) > 1 ? "multiple" : "single");
  const [singlePayer, setSinglePayer] = useState<string | null>(existing?.payers?.[0]?.personId ?? (meId && (group?.memberIds ?? []).includes(meId) ? meId : members[0]?.id ?? null));
  const [multiPayers, setMultiPayers] = useState<Record<string, string>>(() =>
    existing ? Object.fromEntries((existing.payers ?? []).map((p) => [p.personId, formatPlain(p.amountMinor, existing.currency)])) : {}
  );
  const [splitMethod, setSplitMethod] = useState<SplitMethod>(existing?.splitMethod ?? "equal");
  const [participants, setParticipants] = useState<string[]>(existing ? (existing.splits ?? []).map((s) => s.personId) : group?.memberIds ?? []);
  const [values, setValues] = useState<Record<string, string>>(() => {
    if (!existing) return {};
    const out: Record<string, string> = {};
    for (const s of existing.splits ?? []) {
      if (existing.splitMethod === "percentage") out[s.personId] = String(s.percent ?? 0);
      else if (existing.splitMethod === "shares") out[s.personId] = String(s.shares ?? 0);
      else if (existing.splitMethod === "exact") out[s.personId] = formatPlain(s.amountMinor, existing.currency);
    }
    return out;
  });
  const [pending, setPending] = useState<Pending[]>([]);
  const [removed, setRemoved] = useState<Attachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // ----- derivati -----
  const totalMinor = parseAmount(amountText, currency);
  const guess = guessFromTitle(title, categoryId);
  const effectiveCategoryId = categoryTouched ? categoryId : guess.matched ? guess.categoryId : categoryId;
  const previewIcon = guess.matched ? guess.icon : categoryById(effectiveCategoryId).icon;
  const previewCategory = categoryById(effectiveCategoryId);
  const foreign = !!group && currency !== group.currency;
  const rate = Number(rateText.replace(",", "."));

  useEffect(() => {
    // Quando cambia la valuta, precompila il tasso dalla cache o dalla rete.
    if (!group) return;
    if (!foreign) {
      setRateText("1");
      return;
    }
    if (existing && existing.currency === currency) {
      setRateText(String(existing.exchangeRate));
      return;
    }
    const cached = rates[rateKey(currency, group.currency)];
    if (cached) {
      setRateText(String(cached.rate));
    } else {
      void refreshRate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency, group?.currency]);

  const refreshRate = async () => {
    if (!group) return;
    setRateBusy(true);
    const r = await fetchRate(currency, group.currency);
    setRateBusy(false);
    if (r) {
      setRateText(String(r.rate));
      cacheRate(currency, group.currency, r.rate);
    } else {
      notify("Tasso non disponibile", "Nessuna connessione o valuta non supportata: inserisci il tasso a mano.");
    }
  };

  const splitParticipants: SplitParticipant[] = participants.map((pid) => {
    const raw = values[pid] ?? "";
    let value: number | undefined;
    if (splitMethod === "exact") value = parseAmount(raw, currency) ?? 0;
    else if (splitMethod !== "equal") value = raw.trim() === "" ? 0 : Number(raw.replace(",", "."));
    return { personId: pid, value };
  });
  const splitPreview = totalMinor !== null && totalMinor >= 0 ? computeSplits(totalMinor, splitMethod, splitParticipants) : null;
  const previewByPerson = new Map(splitPreview?.ok ? splitPreview.splits.map((s) => [s.personId, s.amountMinor]) : []);
  const percentSum = splitMethod === "percentage" ? splitParticipants.reduce((a, p) => a + (p.value ?? 0), 0) : 0;
  const exactSum = splitMethod === "exact" ? splitParticipants.reduce((a, p) => a + (p.value ?? 0), 0) : 0;
  const multiSum = Object.values(multiPayers).reduce((a, v) => a + (parseAmount(v, currency) ?? 0), 0);

  if (!group) {
    return (
      <Screen>
        <Stack.Screen options={{ title: "Spesa" }} />
        <Text style={{ color: t.text }}>Gruppo non trovato.</Text>
      </Screen>
    );
  }

  const toggleParticipant = (pid: string) => {
    setParticipants((ids) => (ids.includes(pid) ? ids.filter((x) => x !== pid) : [...ids, pid]));
  };

  const equalSplitAll = () => setParticipants(group.memberIds);

  // ----- allegati -----
  const addPendingFromAssets = (assets: { uri: string; fileName?: string | null; mimeType?: string; width?: number; height?: number; name?: string }[]) => {
    const items: Pending[] = assets.map((a, i) => ({
      key: `${Date.now()}-${i}`,
      sourceUri: a.uri,
      fileName: a.fileName ?? a.name ?? `allegato-${Date.now()}`,
      mimeType: a.mimeType ?? (a.uri.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg"),
      width: a.width ?? null,
      height: a.height ?? null,
    }));
    setPending((p) => [...p, ...items]);
  };

  const pickImages = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85, allowsMultipleSelection: true, selectionLimit: 10 });
    if (!res.canceled) addPendingFromAssets(res.assets);
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      notify("Fotocamera non disponibile", "Concedi il permesso nelle impostazioni del telefono.");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!res.canceled) addPendingFromAssets(res.assets);
  };

  const pickDocuments = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"], multiple: true, copyToCacheDirectory: true });
    if (!res.canceled) addPendingFromAssets(res.assets);
  };

  // ----- salvataggio -----
  const save = async () => {
    setError(null);
    if (!title.trim()) return setError("Inserisci un titolo.");
    if (totalMinor === null || totalMinor <= 0) return setError("Inserisci un importo maggiore di zero.");
    if (foreign && (!Number.isFinite(rate) || rate <= 0)) return setError("Inserisci un tasso di cambio valido.");

    let payers: { personId: string; amountMinor: number }[];
    if (payerMode === "single") {
      if (!singlePayer) return setError("Indica chi ha pagato.");
      payers = [{ personId: singlePayer, amountMinor: totalMinor }];
    } else {
      payers = Object.entries(multiPayers)
        .map(([personId, txt]) => ({ personId, amountMinor: parseAmount(txt, currency) ?? 0 }))
        .filter((p) => p.amountMinor > 0);
      const err = validatePayments(totalMinor, payers);
      if (err) return setError(err);
    }

    const result = computeSplits(totalMinor, splitMethod, splitParticipants);
    if (!result.ok) return setError(result.error);

    const input: ExpenseInput = {
      groupId: group.id,
      title,
      notes,
      categoryId: effectiveCategoryId,
      date,
      currency,
      amountMinor: totalMinor,
      exchangeRate: foreign ? rate : 1,
      splitMethod,
      payers,
      splits: result.splits,
    };

    setSaving(true);
    try {
      let expenseId: string;
      if (existing) {
        await actions.updateExpense(existing.id, input);
        expenseId = existing.id;
      } else {
        expenseId = await actions.addExpense(input);
      }
      for (const p of pending) {
        const id = uuid();
        const saved = await saveAttachment({ id, expenseId, sourceUri: p.sourceUri, fileName: p.fileName, mimeType: p.mimeType });
        addAttachment({ id, expenseId, fileName: p.fileName, mimeType: p.mimeType, sizeBytes: saved.sizeBytes, storageKey: saved.storageKey, width: p.width, height: p.height });
      }
      for (const a of removed) {
        await deleteAttachmentFile(a.storageKey);
        removeAttachment(a.id);
      }
      router.back();
    } catch (err) {
      setError(`Salvataggio allegati non riuscito: ${String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const symbol = currencyInfo(currency).symbol;
  const visibleExisting = existingAttachments.filter((a) => !removed.some((r) => r.id === a.id));

  return (
    <Screen>
      <Stack.Screen options={{ title: existing ? "Modifica spesa" : "Nuova spesa" }} />

      {/* Importo e titolo */}
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.md }}>
          <IconBadge icon={previewIcon} color={previewCategory.color} size={56} />
          <View style={{ flex: 1 }}>
            <TextField
              label="Titolo"
              value={title}
              onChangeText={setTitle}
              placeholder="Es. Pizza, Benzina, Hotel…"
              autoFocus={!existing}
              containerStyle={{ marginBottom: 0 }}
              hint={guess.matched && !categoryTouched ? `Icona scelta da "${guess.matched}" · ${previewCategory.name}` : undefined}
            />
          </View>
        </View>
        <TextField
          label="Importo"
          value={amountText}
          onChangeText={setAmountText}
          placeholder="0,00"
          keyboardType="decimal-pad"
          large
          prefix={<Text style={{ color: t.textMuted, fontSize: font.h2, fontWeight: "700" }}>{symbol}</Text>}
          suffix={
            <SelectField
              compact
              value={currency}
              items={CURRENCIES.map((c) => ({ value: c.code, label: c.code, subtitle: c.name }))}
              onChange={setCurrency}
              title="Valuta"
            />
          }
        />
        {foreign ? (
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <TextField
                label={`Tasso ${currency} → ${group.currency}`}
                value={rateText}
                onChangeText={setRateText}
                keyboardType="decimal-pad"
                hint={totalMinor && Number.isFinite(rate) && rate > 0 ? `≈ ${formatMinor(Math.round((totalMinor / 10 ** currencyInfo(currency).decimals) * rate * 10 ** currencyInfo(group.currency).decimals), group.currency)} nel gruppo` : undefined}
                containerStyle={{ marginBottom: 0 }}
              />
            </View>
            <Button title="Aggiorna" icon="refresh" variant="secondary" onPress={refreshRate} loading={rateBusy} />
          </View>
        ) : null}
      </Card>

      {/* Categoria */}
      <SectionHeader title="Categoria" />
      <Card>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {CATEGORIES.map((c) => (
            <Chip
              key={c.id}
              label={c.name}
              icon={c.icon as keyof typeof Ionicons.glyphMap}
              color={c.color}
              selected={effectiveCategoryId === c.id}
              onPress={() => {
                setCategoryId(c.id);
                setCategoryTouched(true);
              }}
            />
          ))}
        </View>
        {categoryTouched && guess.matched && guess.categoryId !== categoryId ? (
          <Pressable onPress={() => setCategoryTouched(false)}>
            <Text style={{ color: t.primary, fontSize: font.small, fontWeight: "700" }}>Torna alla categoria automatica ({categoryById(guess.categoryId).name})</Text>
          </Pressable>
        ) : null}
      </Card>

      {/* Data */}
      <SectionHeader title="Data" />
      <Card>
        <DateField value={date} onChange={setDate} />
      </Card>

      {/* Pagato da */}
      <SectionHeader
        title="Pagato da"
        right={
          <Pressable onPress={() => setPayerMode((m) => (m === "single" ? "multiple" : "single"))}>
            <Text style={{ color: t.primary, fontWeight: "700", fontSize: font.small }}>{payerMode === "single" ? "Più persone" : "Una sola persona"}</Text>
          </Pressable>
        }
      />
      <Card>
        {payerMode === "single" ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {members.map((p) => {
              const on = singlePayer === p.id;
              return (
                <Pressable key={p.id} onPress={() => setSinglePayer(p.id)} style={[styles.person, { backgroundColor: on ? t.primarySoft : t.surfaceAlt, borderColor: on ? t.primary : t.border }]}>
                  <Avatar person={p} size={26} />
                  <Text style={{ color: t.text, fontWeight: "700", marginLeft: 8 }}>{p.isSelf ? "Tu" : p.name}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <>
            {members.map((p) => (
              <View key={p.id} style={styles.inlineRow}>
                <Avatar person={p} size={32} />
                <Text style={{ color: t.text, fontWeight: "600", flex: 1, marginLeft: 10 }}>{p.isSelf ? `${p.name} (tu)` : p.name}</Text>
                <TextField
                  value={multiPayers[p.id] ?? ""}
                  onChangeText={(v) => setMultiPayers((m) => ({ ...m, [p.id]: v }))}
                  placeholder="0,00"
                  keyboardType="decimal-pad"
                  containerStyle={{ width: 120, marginBottom: 0 }}
                  style={{ textAlign: "right" }}
                />
              </View>
            ))}
            <Text style={{ color: totalMinor !== null && multiSum === totalMinor ? t.positive : t.warning, fontSize: font.small, fontWeight: "700", marginTop: 6 }}>
              Pagato {formatMinor(multiSum, currency)} su {formatMinor(totalMinor ?? 0, currency)}
              {totalMinor !== null && multiSum !== totalMinor ? ` · mancano ${formatMinor(totalMinor - multiSum, currency)}` : ""}
            </Text>
          </>
        )}
      </Card>

      {/* Divisione */}
      <SectionHeader
        title={`Diviso fra (${participants.length}/${group.memberIds.length})`}
        right={
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <Pressable onPress={equalSplitAll}><Text style={{ color: t.primary, fontWeight: "700", fontSize: font.small }}>Tutti</Text></Pressable>
            <Pressable onPress={() => setParticipants([])}><Text style={{ color: t.primary, fontWeight: "700", fontSize: font.small }}>Nessuno</Text></Pressable>
          </View>
        }
      />
      <Card>
        <Segmented<SplitMethod>
          options={[
            { value: "equal", label: "Uguale" },
            { value: "percentage", label: "%" },
            { value: "shares", label: "Quote" },
            { value: "exact", label: "Importi" },
          ]}
          value={splitMethod}
          onChange={setSplitMethod}
        />
        {members.map((p) => {
          const on = participants.includes(p.id);
          const share = previewByPerson.get(p.id);
          return (
            <View key={p.id} style={[styles.inlineRow, { opacity: on ? 1 : 0.5 }]}>
              <Pressable onPress={() => toggleParticipant(p.id)} style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                <Ionicons name={on ? "checkbox" : "square-outline"} size={22} color={on ? t.primary : t.textFaint} />
                <Avatar person={p} size={30} />
                <View style={{ marginLeft: 10, flex: 1 }}>
                  <Text style={{ color: t.text, fontWeight: "600" }}>{p.isSelf ? `${p.name} (tu)` : p.name}</Text>
                  {on && share !== undefined ? <Text style={{ color: t.textMuted, fontSize: font.small }}>{formatMinor(share, currency)}</Text> : null}
                </View>
              </Pressable>
              {on && splitMethod !== "equal" ? (
                <TextField
                  value={values[p.id] ?? ""}
                  onChangeText={(v) => setValues((m) => ({ ...m, [p.id]: v }))}
                  placeholder={splitMethod === "percentage" ? "%" : splitMethod === "shares" ? "quote" : "0,00"}
                  keyboardType="decimal-pad"
                  containerStyle={{ width: 100, marginBottom: 0 }}
                  style={{ textAlign: "right" }}
                  suffix={splitMethod === "percentage" ? <Text style={{ color: t.textMuted }}>%</Text> : splitMethod === "shares" ? <Text style={{ color: t.textMuted }}>×</Text> : undefined}
                />
              ) : null}
            </View>
          );
        })}
        {splitMethod === "percentage" ? (
          <Text style={{ color: Math.abs(percentSum - 100) < 0.01 ? t.positive : t.warning, fontSize: font.small, fontWeight: "700", marginTop: 6 }}>Totale {Math.round(percentSum * 100) / 100}% su 100%</Text>
        ) : null}
        {splitMethod === "exact" ? (
          <Text style={{ color: totalMinor !== null && exactSum === totalMinor ? t.positive : t.warning, fontSize: font.small, fontWeight: "700", marginTop: 6 }}>
            Assegnato {formatMinor(exactSum, currency)} su {formatMinor(totalMinor ?? 0, currency)}
          </Text>
        ) : null}
        {splitPreview && !splitPreview.ok && participants.length > 0 ? <Text style={{ color: t.textFaint, fontSize: font.tiny, marginTop: 4 }}>{splitPreview.error}</Text> : null}
      </Card>

      {/* Allegati */}
      <SectionHeader title="Allegati" />
      <Card>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {visibleExisting.map((a) => (
            <AttachmentThumb key={a.id} source={{ key: a.id, fileName: a.fileName, mimeType: a.mimeType, storageKey: a.storageKey }} onRemove={() => setRemoved((r) => [...r, a])} />
          ))}
          {pending.map((p) => (
            <AttachmentThumb key={p.key} source={{ key: p.key, fileName: p.fileName, mimeType: p.mimeType, uri: p.sourceUri }} onRemove={() => setPending((list) => list.filter((x) => x.key !== p.key))} />
          ))}
        </View>
        <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
          {Platform.OS !== "web" ? <Button title="Scatta foto" icon="camera-outline" variant="secondary" size="sm" onPress={takePhoto} /> : null}
          <Button title="Galleria" icon="images-outline" variant="secondary" size="sm" onPress={pickImages} />
          <Button title="File / PDF" icon="document-attach-outline" variant="secondary" size="sm" onPress={pickDocuments} />
        </View>
        <Text style={{ color: t.textFaint, fontSize: font.tiny, marginTop: spacing.sm }}>I file vengono copiati nella memoria privata dell'app, a piena risoluzione.</Text>
      </Card>

      {/* Note */}
      <SectionHeader title="Note" />
      <Card>
        <TextField value={notes} onChangeText={setNotes} placeholder="Dettagli, chi c'era, cosa comprende…" multiline numberOfLines={3} style={{ minHeight: 70, textAlignVertical: "top" }} containerStyle={{ marginBottom: 0 }} />
      </Card>

      {error ? (
        <View style={[styles.errorBox, { backgroundColor: t.negativeSoft }]}>
          <Ionicons name="alert-circle" size={18} color={t.negative} />
          <Text style={{ color: t.negative, fontWeight: "600", flex: 1, marginLeft: 8 }}>{error}</Text>
        </View>
      ) : null}
      <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
        <Button title={existing ? "Salva modifiche" : "Salva spesa"} icon="checkmark" size="lg" onPress={save} loading={saving} style={{ flex: 1 }} />
        <Button title="Annulla" variant="secondary" size="lg" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  person: { flexDirection: "row", alignItems: "center", paddingVertical: 6, paddingLeft: 6, paddingRight: 12, borderRadius: radius.pill, borderWidth: 1, marginRight: 8, marginBottom: 8 },
  inlineRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6 },
  errorBox: { flexDirection: "row", alignItems: "center", padding: spacing.md, borderRadius: radius.md, marginTop: spacing.sm },
});
