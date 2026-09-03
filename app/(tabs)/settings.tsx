import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, Text, View } from "react-native";
import { parseFirebaseConfigSnippet } from "@/cloud/configParse";
import {
  authenticateGoogleDrive,
  downloadBackupFromGoogleDrive,
  uploadBackupToGoogleDrive,
} from "@/cloud/googleDriveSync";
import {
  authenticateOneDrive,
  downloadBackupFromOneDrive,
  uploadBackupToOneDrive,
} from "@/cloud/oneDriveSync";
import { CURRENCIES } from "@/domain/money";
import type { ThemePreference } from "@/domain/types";
import { exportBackup, pickBackup } from "@/store/backup";
import { flushWrites } from "@/store/persistence";
import { useStore } from "@/store/store";
import {
  Button,
  Card,
  CloudProjectCard,
  EmptyState,
  ListRow,
  Screen,
  SectionHeader,
  Segmented,
  SelectField,
  TextField,
} from "@/ui/components";
import { confirm, notify } from "@/ui/dialogs";
import { font, radius, spacing, useTheme } from "@/ui/theme";

export default function SettingsScreen() {
  const t = useTheme();
  const router = useRouter();
  const settings = useStore((s) => s.data.settings);
  const data = useStore((s) => s.data);
  const updateSettings = useStore((s) => s.updateSettings);
  const updateCloudStorage = useStore((s) => s.updateCloudStorage);
  const replaceAll = useStore((s) => s.replaceAll);
  const resetAll = useStore((s) => s.resetAll);
  const addCloudProject = useStore((s) => s.addCloudProject);
  const updateCloudProject = useStore((s) => s.updateCloudProject);
  const removeCloudProject = useStore((s) => s.removeCloudProject);

  const [name, setName] = useState(settings.ownerName || data.people.find((p) => p.isSelf)?.name || "");
  const [busy, setBusy] = useState(false);
  const [cloudStorageBusy, setCloudStorageBusy] = useState<string | null>(null);

  const [addingProject, setAddingProject] = useState(false);
  const [projectLabel, setProjectLabel] = useState("");
  const [configText, setConfigText] = useState("");
  const [configError, setConfigError] = useState<string | null>(null);

  const oneDrive = settings.cloudStorage?.oneDrive;
  const googleDrive = settings.cloudStorage?.googleDrive;

  useEffect(() => {
    const self = data.people.find((p) => p.isSelf);
    if (self && !settings.ownerName) setName(self.name);
  }, [data.people, settings.ownerName]);

  const saveProject = () => {
    const config = parseFirebaseConfigSnippet(configText);
    if (!config) {
      setConfigError(
        "Non trovo apiKey, authDomain, projectId e appId in questo testo. Incolla lo snippet di configurazione da Firebase (Impostazioni progetto → Le tue app → Configurazione)."
      );
      return;
    }
    addCloudProject({ label: projectLabel || config.projectId, config });
    setProjectLabel("");
    setConfigText("");
    setConfigError(null);
    setAddingProject(false);
  };

  // --- OneDrive Handlers ---
  const handleConnectOneDrive = async () => {
    setCloudStorageBusy("oneDrive");
    try {
      const res = await authenticateOneDrive();
      updateCloudStorage("oneDrive", {
        connected: true,
        userEmail: res.email,
        userName: res.name,
        accessToken: res.accessToken,
      });
      notify("Microsoft OneDrive collegato", `Connesso come ${res.email}`);
    } catch (err) {
      notify("Connessione OneDrive non riuscita", String(err));
    } finally {
      setCloudStorageBusy(null);
    }
  };

  const handleBackupOneDrive = async () => {
    if (!oneDrive?.accessToken) {
      await handleConnectOneDrive();
      return;
    }
    setCloudStorageBusy("oneDrive");
    try {
      await flushWrites();
      const res = await uploadBackupToOneDrive(oneDrive.accessToken, data);
      updateCloudStorage("oneDrive", { lastSync: res.timestamp });
      notify("Backup salvato su OneDrive", "I dati sono stati archiviati con successo su Microsoft OneDrive.");
    } catch (err) {
      notify("Errore salvataggio OneDrive", String(err));
    } finally {
      setCloudStorageBusy(null);
    }
  };

  const handleRestoreOneDrive = async () => {
    if (!oneDrive?.accessToken) {
      await handleConnectOneDrive();
      return;
    }
    setCloudStorageBusy("oneDrive");
    try {
      const restoredData = await downloadBackupFromOneDrive(oneDrive.accessToken);
      const ok = await confirm(
        "Ripristinare da OneDrive?",
        `Il backup contiene ${restoredData.groups?.length ?? 0} gruppi e ${restoredData.expenses?.length ?? 0} spese. I dati attuali verranno sostituiti.`,
        { confirmText: "Ripristina", destructive: true }
      );
      if (ok) {
        replaceAll(restoredData);
        notify("Dati ripristinati con successo da Microsoft OneDrive!");
      }
    } catch (err) {
      notify("Errore ripristino OneDrive", String(err));
    } finally {
      setCloudStorageBusy(null);
    }
  };

  const handleDisconnectOneDrive = () => {
    updateCloudStorage("oneDrive", { connected: false, accessToken: null, userEmail: null, userName: null });
    notify("OneDrive disconnesso");
  };

  // --- Google Drive Handlers ---
  const handleConnectGoogleDrive = async () => {
    setCloudStorageBusy("googleDrive");
    try {
      const res = await authenticateGoogleDrive();
      updateCloudStorage("googleDrive", {
        connected: true,
        userEmail: res.email,
        userName: res.name,
        accessToken: res.accessToken,
      });
      notify("Google Drive collegato", `Connesso come ${res.email}`);
    } catch (err) {
      notify("Connessione Google Drive non riuscita", String(err));
    } finally {
      setCloudStorageBusy(null);
    }
  };

  const handleBackupGoogleDrive = async () => {
    if (!googleDrive?.accessToken) {
      await handleConnectGoogleDrive();
      return;
    }
    setCloudStorageBusy("googleDrive");
    try {
      await flushWrites();
      const res = await uploadBackupToGoogleDrive(googleDrive.accessToken, data);
      updateCloudStorage("googleDrive", { lastSync: res.timestamp });
      notify("Backup salvato su Google Drive", "I dati sono stati archiviati con successo su Google Drive.");
    } catch (err) {
      notify("Errore salvataggio Google Drive", String(err));
    } finally {
      setCloudStorageBusy(null);
    }
  };

  const handleRestoreGoogleDrive = async () => {
    if (!googleDrive?.accessToken) {
      await handleConnectGoogleDrive();
      return;
    }
    setCloudStorageBusy("googleDrive");
    try {
      const restoredData = await downloadBackupFromGoogleDrive(googleDrive.accessToken);
      const ok = await confirm(
        "Ripristinare da Google Drive?",
        `Il backup contiene ${restoredData.groups?.length ?? 0} gruppi e ${restoredData.expenses?.length ?? 0} spese. I dati attuali verranno sostituiti.`,
        { confirmText: "Ripristina", destructive: true }
      );
      if (ok) {
        replaceAll(restoredData);
        notify("Dati ripristinati con successo da Google Drive!");
      }
    } catch (err) {
      notify("Errore ripristino Google Drive", String(err));
    } finally {
      setCloudStorageBusy(null);
    }
  };

  const handleDisconnectGoogleDrive = () => {
    updateCloudStorage("googleDrive", { connected: false, accessToken: null, userEmail: null, userName: null });
    notify("Google Drive disconnesso");
  };

  // --- File Export / Import Handlers ---
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
    const ok = await confirm(
      "Cancellare tutto?",
      "Gruppi, persone, spese e rimborsi verranno eliminati definitivamente da questo dispositivo.",
      {
        confirmText: "Cancella tutto",
        destructive: true,
      }
    );
    if (ok) resetAll();
  };

  const version = Constants.expoConfig?.version ?? "0.1.0";
  const counts = `${data.groups.length} gruppi · ${data.people.length} persone · ${data.expenses.length} spese · ${data.attachments.length} allegati`;

  const formatLastSync = (iso?: string | null) => {
    if (!iso) return "Nessun salvataggio recente";
    try {
      const d = new Date(iso);
      return `Ultimo salvataggio: ${d.toLocaleDateString("it-IT")} ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;
    } catch {
      return `Ultimo: ${iso}`;
    }
  };

  return (
    <Screen title="Impostazioni">
      {/* 1. Profilo */}
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
        <Text style={{ color: t.textMuted, fontSize: font.small, fontWeight: "700", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.6 }}>
          Tema
        </Text>
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

      {/* 2. Cloud Storage & Backup (Regola Studio #9) */}
      <SectionHeader title="Account & Cloud Storage" />
      <Card>
        <Text style={{ color: t.textMuted, fontSize: font.small, lineHeight: 20, marginBottom: spacing.md }}>
          Collega il tuo account Microsoft o Google per salvare automaticamente i tuoi dati sul tuo cloud personale,
          esportare i backup e ripristinarli su qualsiasi dispositivo in totale sicurezza.
        </Text>

        {/* Microsoft OneDrive Box */}
        <View style={[styles.storageBox, { backgroundColor: t.surfaceAlt, borderColor: t.border }]}>
          <View style={styles.storageHeader}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={{ color: t.text, fontWeight: "800", fontSize: font.body }}>Microsoft OneDrive</Text>
                <View
                  style={[
                    styles.statusPill,
                    { backgroundColor: oneDrive?.connected ? t.positiveSoft : t.surface },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      { color: oneDrive?.connected ? t.positive : t.textFaint },
                    ]}
                  >
                    {oneDrive?.connected ? "Connesso" : "Non collegato"}
                  </Text>
                </View>
              </View>
              {oneDrive?.connected && oneDrive.userEmail ? (
                <Text style={{ color: t.textMuted, fontSize: font.tiny, marginTop: 2 }}>{oneDrive.userEmail}</Text>
              ) : null}
              {oneDrive?.connected ? (
                <Text style={{ color: t.textFaint, fontSize: 10, marginTop: 2 }}>
                  {formatLastSync(oneDrive.lastSync)}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap", marginTop: spacing.sm }}>
            {!oneDrive?.connected ? (
              <Button
                title="Connetti OneDrive"
                icon="logo-microsoft"
                variant="secondary"
                size="sm"
                onPress={handleConnectOneDrive}
                loading={cloudStorageBusy === "oneDrive"}
              />
            ) : (
              <>
                <Button
                  title="Salva su OneDrive"
                  icon="cloud-upload-outline"
                  variant="primary"
                  size="sm"
                  onPress={handleBackupOneDrive}
                  loading={cloudStorageBusy === "oneDrive"}
                />
                <Button
                  title="Ripristina"
                  icon="cloud-download-outline"
                  variant="secondary"
                  size="sm"
                  onPress={handleRestoreOneDrive}
                  loading={cloudStorageBusy === "oneDrive"}
                />
                <Button
                  title="Disconnetti"
                  variant="ghost"
                  size="sm"
                  onPress={handleDisconnectOneDrive}
                />
              </>
            )}
          </View>
        </View>

        {/* Google Drive Box */}
        <View style={[styles.storageBox, { backgroundColor: t.surfaceAlt, borderColor: t.border }]}>
          <View style={styles.storageHeader}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={{ color: t.text, fontWeight: "800", fontSize: font.body }}>Google Drive</Text>
                <View
                  style={[
                    styles.statusPill,
                    { backgroundColor: googleDrive?.connected ? t.positiveSoft : t.surface },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      { color: googleDrive?.connected ? t.positive : t.textFaint },
                    ]}
                  >
                    {googleDrive?.connected ? "Connesso" : "Non collegato"}
                  </Text>
                </View>
              </View>
              {googleDrive?.connected && googleDrive.userEmail ? (
                <Text style={{ color: t.textMuted, fontSize: font.tiny, marginTop: 2 }}>{googleDrive.userEmail}</Text>
              ) : null}
              {googleDrive?.connected ? (
                <Text style={{ color: t.textFaint, fontSize: 10, marginTop: 2 }}>
                  {formatLastSync(googleDrive.lastSync)}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap", marginTop: spacing.sm }}>
            {!googleDrive?.connected ? (
              <Button
                title="Connetti Google Drive"
                icon="logo-google"
                variant="secondary"
                size="sm"
                onPress={handleConnectGoogleDrive}
                loading={cloudStorageBusy === "googleDrive"}
              />
            ) : (
              <>
                <Button
                  title="Salva su Drive"
                  icon="cloud-upload-outline"
                  variant="primary"
                  size="sm"
                  onPress={handleBackupGoogleDrive}
                  loading={cloudStorageBusy === "googleDrive"}
                />
                <Button
                  title="Ripristina"
                  icon="cloud-download-outline"
                  variant="secondary"
                  size="sm"
                  onPress={handleRestoreGoogleDrive}
                  loading={cloudStorageBusy === "googleDrive"}
                />
                <Button
                  title="Disconnetti"
                  variant="ghost"
                  size="sm"
                  onPress={handleDisconnectGoogleDrive}
                />
              </>
            )}
          </View>
        </View>

        {/* Offline File Backup */}
        <View style={{ borderTopWidth: 1, borderTopColor: t.border, paddingTop: spacing.md, marginTop: spacing.xs }}>
          <Text style={{ color: t.text, fontWeight: "700", fontSize: font.small, marginBottom: 4 }}>
            File locale (JSON)
          </Text>
          <Text style={{ color: t.textFaint, fontSize: font.tiny, marginBottom: spacing.sm }}>
            Scarica un file sul dispositivo o importane uno esistente.
          </Text>
          <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
            <Button title="Esporta file" icon="download-outline" variant="secondary" size="sm" onPress={onExport} loading={busy} />
            <Button title="Importa file" icon="folder-open-outline" variant="secondary" size="sm" onPress={onImport} />
          </View>
          <Text style={{ color: t.textFaint, fontSize: font.tiny, marginTop: spacing.sm }}>{counts}</Text>
        </View>
      </Card>

      {/* 3. Gruppi condivisi */}
      <SectionHeader
        title="Gruppi condivisi in tempo reale"
        right={<Button title="Ho un invito" size="sm" variant="ghost" icon="link" onPress={() => router.push("/join")} />}
      />
      <Card>
        <Text style={{ color: t.textMuted, fontSize: font.small, lineHeight: 20, marginBottom: spacing.md }}>
          Dividi le spese in tempo reale con altre persone. Accedi direttamente con il tuo account Microsoft, Google, Email o come Ospite.
          Tutti i membri possono aggiungere spese istantaneamente.
        </Text>

        {settings.cloudProjects.length === 0 ? (
          <EmptyState
            icon="cloud-outline"
            title="Nessun progetto collegato"
            message="Serve solo la prima volta che vuoi creare un gruppo condiviso."
          />
        ) : (
          settings.cloudProjects.map((p) => (
            <CloudProjectCard
              key={p.id}
              project={p}
              onUpdate={(patch) => updateCloudProject(p.id, patch)}
              onRemove={() => removeCloudProject(p.id)}
            />
          ))
        )}

        {addingProject ? (
          <View style={{ marginTop: spacing.sm }}>
            <TextField label="Nome etichetta (facoltativo)" value={projectLabel} onChangeText={setProjectLabel} placeholder="Es. Il mio Firebase" />
            <TextField
              label="Configurazione Firebase"
              value={configText}
              onChangeText={(v) => {
                setConfigText(v);
                setConfigError(null);
              }}
              placeholder={"Incolla qui lo snippet da\nImpostazioni progetto → Le tue app"}
              multiline
              numberOfLines={5}
              autoCapitalize="none"
              style={{ minHeight: 100, textAlignVertical: "top" }}
              error={configError}
            />
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Button title="Collega" onPress={saveProject} />
              <Button title="Annulla" variant="secondary" onPress={() => setAddingProject(false)} />
            </View>
          </View>
        ) : (
          <Button
            title="Aggiungi un progetto Firebase personale"
            icon="add"
            variant="ghost"
            size="sm"
            onPress={() => setAddingProject(true)}
            style={{ marginTop: spacing.xs }}
          />
        )}
      </Card>

      {/* 4. Informazioni */}
      <SectionHeader title="Informazioni" />
      <Card padded={false}>
        <ListRow title="Versione" trailing={<Text style={{ color: t.textMuted }}>{version}</Text>} />
        <ListRow title="Piattaforma" trailing={<Text style={{ color: t.textMuted }}>{Platform.OS === "web" ? "Desktop / Web" : Platform.OS}</Text>} />
        <ListRow
          title="Archiviazione"
          subtitle={Platform.OS === "web" ? "Browser (localStorage + IndexedDB)" : "File privato dell'app (JSON) + cartella allegati"}
        />
        <ListRow title="Tassi di cambio" subtitle="Scaricati da API pubbliche quando serve, poi riutilizzati offline" />
        <ListRow title="Licenza" subtitle="Open source, senza pubblicità, senza abbonamenti" last />
      </Card>

      {/* 5. Zona pericolosa */}
      <SectionHeader title="Zona pericolosa" />
      <Card>
        <Button title="Cancella tutti i dati" icon="trash-outline" variant="danger" onPress={onReset} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  storageBox: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  storageHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  statusPill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
});
