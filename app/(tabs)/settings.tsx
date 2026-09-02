import Constants from "expo-constants";
import { useEffect, useState } from "react";
import { Platform, Text, View } from "react-native";
import { CURRENCIES } from "@/domain/money";
import type { ThemePreference } from "@/domain/types";
import { exportBackup, pickBackup } from "@/store/backup";
import { flushWrites } from "@/store/persistence";
import { useStore } from "@/store/store";
import { Button, Card, ListRow, Screen, SectionHeader, Segmented, SelectField, TextField } from "@/ui/components";
import { confirm, notify } from "@/ui/dialogs";
import { font, spacing, useTheme } from "@/ui/theme";

export default function SettingsScreen() {
  const t = useTheme();
  const settings = useStore((s) => s.data.settings);
  const data = useStore((s) => s.data);
  const updateSettings = useStore((s) => s.updateSettings);
  const replaceAll = useStore((s) => s.replaceAll);
  const resetAll = useStore((s) => s.resetAll);
  const [name, setName] = useState(settings.ownerName || data.people.find((p) => p.isSelf)?.name || "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const self = data.people.find((p) => p.isSelf);
    if (self && !settings.ownerName) setName(self.name);
  }, [data.people, settings.ownerName]);

  const onExport = async () => {
    setBusy(true);
    try {
      await flushWrites();
      await exportBackup(data);
    } catch (err) {
      notify("Esportazione non riuscita", String(err));
    } finally {
      setBusy(false);
    }
  };

  const onImport = async () => {
    const res = await pickBackup();
    if (!res.ok) {
      if ("error" in res) notify("Importazione non riuscita", res.error);
      return;
    }
    const ok = await confirm(
      "Sostituire i dati?",
      `Il backup contiene ${res.data.groups.length} gruppi, ${res.data.expenses.length} spese e ${res.data.people.length} persone. I dati attuali verranno sostituiti (gli allegati non sono inclusi nel backup).`,
      { confirmText: "Importa", destructive: true }
    );
    if (ok) {
      replaceAll(res.data);
      notify("Backup importato");
    }
  };

  const onReset = async () => {
    const ok = await confirm("Cancellare tutto?", "Gruppi, persone, spese e rimborsi verranno eliminati definitivamente da questo dispositivo.", {
      confirmText: "Cancella tutto",
      destructive: true,
    });
    if (ok) resetAll();
  };

  const version = Constants.expoConfig?.version ?? "0.1.0";
  const counts = `${data.groups.length} gruppi · ${data.people.length} persone · ${data.expenses.length} spese · ${data.attachments.length} allegati`;

  return (
    <Screen title="Impostazioni">
      <SectionHeader title="Profilo" first />
      <Card>
        <TextField
          label="Il tuo nome"
          value={name}
          onChangeText={setName}
          onBlur={() => updateSettings({ ownerName: name.trim() })}
          placeholder="Come ti chiami?"
          hint="Compare come 'tu' nei bilanci."
        />
        <SelectField
          label="Valuta predefinita"
          value={settings.defaultCurrency}
          items={CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} · ${c.name}`, subtitle: c.symbol }))}
          onChange={(v) => updateSettings({ defaultCurrency: v })}
        />
        <Text style={{ color: t.textMuted, fontSize: font.small, fontWeight: "700", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.6 }}>Tema</Text>
        <Segmented<ThemePreference>
          options={[
            { value: "system", label: "Sistema" },
            { value: "light", label: "Chiaro" },
            { value: "dark", label: "Scuro" },
          ]}
          value={settings.theme}
          onChange={(v) => updateSettings({ theme: v })}
        />
      </Card>

      <SectionHeader title="Backup" />
      <Card>
        <Text style={{ color: t.textMuted, fontSize: font.small, lineHeight: 20, marginBottom: spacing.md }}>
          I dati vivono solo su questo dispositivo. Esporta un file JSON per conservarli o trasferirli su un altro telefono o sul Mac. Gli allegati (foto e PDF) restano nella memoria dell'app e non sono inclusi.
        </Text>
        <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
          <Button title="Esporta backup" icon="download-outline" onPress={onExport} loading={busy} />
          <Button title="Importa backup" icon="folder-open-outline" variant="secondary" onPress={onImport} />
        </View>
        <Text style={{ color: t.textFaint, fontSize: font.tiny, marginTop: spacing.md }}>{counts}</Text>
      </Card>

      <SectionHeader title="Informazioni" />
      <Card padded={false}>
        <ListRow title="Versione" trailing={<Text style={{ color: t.textMuted }}>{version}</Text>} />
        <ListRow title="Piattaforma" trailing={<Text style={{ color: t.textMuted }}>{Platform.OS === "web" ? "Desktop / Web" : Platform.OS}</Text>} />
        <ListRow title="Archiviazione" subtitle={Platform.OS === "web" ? "Browser (localStorage + IndexedDB)" : "File privato dell'app (JSON) + cartella allegati"} />
        <ListRow title="Tassi di cambio" subtitle="Scaricati da API pubbliche quando serve, poi riutilizzati offline" />
        <ListRow title="Licenza" subtitle="Open source, senza pubblicità, senza abbonamenti" last />
      </Card>

      <SectionHeader title="Zona pericolosa" />
      <Card>
        <Button title="Cancella tutti i dati" icon="trash-outline" variant="danger" onPress={onReset} />
      </Card>
    </Screen>
  );
}
