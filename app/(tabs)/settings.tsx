import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { parseFirebaseConfigSnippet } from "@/cloud/configParse";
import { sendTelegramMessage } from "@/cloud/telegram";
import { getCachedBotUsername } from "@/cloud/fileShare/telegramSync";
import {
  connectGoogleDriveAccount,
  downloadBackupFromGoogleDrive,
  uploadBackupToGoogleDrive,
} from "@/cloud/googleDriveSync";
import {
  connectOneDriveAccount,
  downloadBackupFromOneDrive,
  uploadBackupToOneDrive,
} from "@/cloud/oneDriveSync";
import { isPlaceholderClientId } from "@/cloud/defaultConfig";
import { webdavTestConnection } from "@/cloud/fileShare/webdav";
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
import { CloudStorageConnectModal } from "@/ui/components/CloudStorageConnectModal";
import { confirm, notify } from "@/ui/dialogs";
import { font, radius, spacing, useTheme } from "@/ui/theme";

export default function SettingsScreen() {
  const t = useTheme();
  const router = useRouter();
  const settings = useStore((s) => s.data.settings);
  const data = useStore((s) => s.data);
  const updateSettings = useStore((s) => s.updateSettings);
  const updateTelegramSettings = useStore((s) => s.updateTelegramSettings);
  const updateCloudStorage = useStore((s) => s.updateCloudStorage);
  const updateWebdavSettings = useStore((s) => s.updateWebdavSettings);
  const replaceAll = useStore((s) => s.replaceAll);
  const resetAll = useStore((s) => s.resetAll);
  const addCloudProject = useStore((s) => s.addCloudProject);
  const updateCloudProject = useStore((s) => s.updateCloudProject);
  const removeCloudProject = useStore((s) => s.removeCloudProject);

  const [name, setName] = useState(settings.ownerName || data.people.find((p) => p.isSelf)?.name || "");
  const [busy, setBusy] = useState(false);
  const [cloudStorageBusy, setCloudStorageBusy] = useState<string | null>(null);
  const [storageModalService, setStorageModalService] = useState<"oneDrive" | "googleDrive" | null>(null);

  const [addingProject, setAddingProject] = useState(false);
  const [showAdvancedCloud, setShowAdvancedCloud] = useState(false);
  const [projectLabel, setProjectLabel] = useState("");
  const [configText, setConfigText] = useState("");
  const [configError, setConfigError] = useState<string | null>(null);
  const [telegramTestBusy, setTelegramTestBusy] = useState(false);
  const [telegramBotUsername, setTelegramBotUsername] = useState<string | null>(null);

  const oneDrive = settings.cloudStorage?.oneDrive;
  const googleDrive = settings.cloudStorage?.googleDrive;
  const webdav = settings.webdav;
  const telegram = settings.telegram ?? { enabled: false, botToken: "", chatId: "" };

  // Se c'è un token salvato, mostra l'username del bot (getMe lazy, con cache in memoria).
  useEffect(() => {
    const token = telegram.botToken.trim();
    if (!token) {
      setTelegramBotUsername(null);
      return;
    }
    let cancelled = false;
    getCachedBotUsername(token)
      .then((u) => {
        if (!cancelled) setTelegramBotUsername(u);
      })
      .catch(() => {
        if (!cancelled) setTelegramBotUsername(null);
      });
    return () => {
      cancelled = true;
    };
  }, [telegram.botToken]);

  const [webdavUrl, setWebdavUrl] = useState(webdav?.url ?? "");
  const [webdavUser, setWebdavUser] = useState(webdav?.username ?? "");
  const [webdavPassword, setWebdavPassword] = useState(webdav?.password ?? "");
  const [webdavBusy, setWebdavBusy] = useState(false);

  /** Verifica le credenziali inserite; se il server risponde, le salva come connessione attiva. */
  const handleWebdavVerify = async () => {
    setWebdavBusy(true);
    try {
      const cfg = { url: webdavUrl.trim(), username: webdavUser.trim(), password: webdavPassword };
      const res = await webdavTestConnection(cfg);
      if (res.ok) {
        updateWebdavSettings({ ...cfg, connected: true });
        notify("WebDAV connesso", "Il server ha risposto correttamente: i tuoi dati verranno sincronizzati qui.");
      } else {
        notify("Verifica non riuscita", res.error ?? "Errore sconosciuto.");
      }
    } finally {
      setWebdavBusy(false);
    }
  };

  const handleWebdavDisconnect = async () => {
    const yes = await confirm(
      "Disconnettere WebDAV?",
      "I dati restano sul server, ma questo dispositivo non sincronizzerà più con WebDAV."
    );
    if (!yes) return;
    updateWebdavSettings({ connected: false, lastSync: null });
  };

  const handleTelegramTest = async () => {
    setTelegramTestBusy(true);
    try {
      // La prova forza enabled: si può testare la configurazione prima di attivarla.
      const res = await sendTelegramMessage(
        { ...telegram, enabled: true },
        "✅ SplitFree: messaggio di prova. Le notifiche Telegram sono configurate correttamente."
      );
      if (res.ok) {
        notify("Messaggio di prova inviato", "Controlla la chat Telegram: dovresti aver ricevuto il messaggio.");
      } else if (res.error === "not-configured") {
        notify("Configurazione incompleta", "Inserisci il token del bot e la Chat ID, poi riprova.");
      } else {
        notify("Invio fallito", res.error ?? "Errore sconosciuto.");
      }
    } finally {
      setTelegramTestBusy(false);
    }
  };

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

  const handleStorageConnect = (account: {
    email: string;
    name?: string;
    clientId?: string;
    accessToken?: string;
    refreshToken?: string | null;
    expiresAt?: string | null;
  }) => {
    if (!storageModalService) return;
    const isOne = storageModalService === "oneDrive";
    updateCloudStorage(storageModalService, {
      connected: true,
      userEmail: account.email,
      userName: account.name || null,
      accessToken: account.accessToken || null,
      refreshToken: account.refreshToken ?? null,
      expiresAt: account.expiresAt ?? null,
      clientId: account.clientId || null,
    });
    notify(
      isOne ? "Microsoft OneDrive collegato" : "Google Drive collegato",
      `Connesso con l'account ${account.email}`
    );
  };

  /** Riconnetti: nuovo flusso OAuth con refresh token; senza client ID salvato apre il modal. */
  const handleStorageReconnect = async (service: "oneDrive" | "googleDrive") => {
    const existing = service === "oneDrive" ? oneDrive : googleDrive;
    const storedClientId = existing?.clientId?.trim() || "";
    if (!storedClientId || isPlaceholderClientId(storedClientId)) {
      setStorageModalService(service);
      return;
    }
    setCloudStorageBusy(service);
    try {
      const account =
        service === "googleDrive"
          ? await connectGoogleDriveAccount(storedClientId)
          : await connectOneDriveAccount(storedClientId);
      updateCloudStorage(service, {
        connected: true,
        userEmail: account.email,
        userName: account.name,
        accessToken: account.accessToken,
        refreshToken: account.refreshToken,
        expiresAt: account.expiresAt,
        clientId: storedClientId,
      });
      notify(
        service === "oneDrive" ? "OneDrive riconnesso" : "Google Drive riconnesso",
        account.refreshToken
          ? "Accesso completo: la sessione si rinnoverà da sola."
          : "Accesso temporaneo (~1h): su web Google non rilascia il rinnovo automatico."
      );
    } catch (err) {
      notify("Riconnessione non riuscita", String(err));
    } finally {
      setCloudStorageBusy(null);
    }
  };

  /** Stato del token: "accesso completo" (refresh token) o "accesso temporaneo". */
  const tokenStatusText = (service: { accessToken?: string | null; refreshToken?: string | null } | undefined) =>
    service?.refreshToken ? "Accesso completo (rinnovo automatico)" : "Accesso temporaneo — riconnetti";

  // --- OneDrive Handlers ---
  const handleConnectOneDrive = () => {
    setStorageModalService("oneDrive");
  };

  const handleBackupOneDrive = async () => {
    if (!oneDrive?.connected) {
      setStorageModalService("oneDrive");
      return;
    }
    setCloudStorageBusy("oneDrive");
    try {
      await flushWrites();
      if (oneDrive.accessToken) {
        const res = await uploadBackupToOneDrive(oneDrive.accessToken, data);
        updateCloudStorage("oneDrive", { lastSync: res.timestamp });
        notify("Backup salvato su OneDrive", "I dati sono stati archiviati con successo su Microsoft OneDrive.");
      } else {
        await exportBackup(data);
        const now = new Date().toISOString();
        updateCloudStorage("oneDrive", { lastSync: now });
        notify(
          "Backup pronto per OneDrive",
          `File splitfree-backup.json esportato con successo per ${oneDrive.userEmail || "il tuo account Microsoft"}. Salvalo nella tua cartella OneDrive.`
        );
      }
    } catch (err) {
      notify("Errore salvataggio OneDrive", String(err));
    } finally {
      setCloudStorageBusy(null);
    }
  };

  const handleRestoreOneDrive = async () => {
    if (!oneDrive?.connected) {
      setStorageModalService("oneDrive");
      return;
    }
    setCloudStorageBusy("oneDrive");
    try {
      if (oneDrive.accessToken) {
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
      } else {
        const ok = await confirm(
          "Ripristinare backup OneDrive?",
          "Seleziona il file di backup salvato dal tuo account OneDrive. I dati attuali verranno sostituiti con quelli del file.",
          { confirmText: "Seleziona file", destructive: true }
        );
        if (ok) {
          const res = await pickBackup();
          if (res.ok) {
            replaceAll(res.data);
            notify("Dati ripristinati con successo per l'account Microsoft!");
          } else if ("error" in res) {
            notify("Errore ripristino", res.error || "File non valido.");
          }
        }
      }
    } catch (err) {
      notify("Errore ripristino OneDrive", String(err));
    } finally {
      setCloudStorageBusy(null);
    }
  };

  const handleDisconnectOneDrive = () => {
    updateCloudStorage("oneDrive", {
      connected: false,
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      userEmail: null,
      userName: null,
    });
    notify("OneDrive disconnesso");
  };

  // --- Google Drive Handlers ---
  const handleConnectGoogleDrive = () => {
    setStorageModalService("googleDrive");
  };

  const handleBackupGoogleDrive = async () => {
    if (!googleDrive?.connected) {
      setStorageModalService("googleDrive");
      return;
    }
    setCloudStorageBusy("googleDrive");
    try {
      await flushWrites();
      if (googleDrive.accessToken) {
        const res = await uploadBackupToGoogleDrive(googleDrive.accessToken, data);
        updateCloudStorage("googleDrive", { lastSync: res.timestamp });
        notify("Backup salvato su Google Drive", "I dati sono stati archiviati con successo su Google Drive.");
      } else {
        await exportBackup(data);
        const now = new Date().toISOString();
        updateCloudStorage("googleDrive", { lastSync: now });
        notify(
          "Backup pronto per Google Drive",
          `File splitfree-backup.json esportato con successo per ${googleDrive.userEmail || "il tuo account Google"}. Salvalo nella tua cartella Google Drive.`
        );
      }
    } catch (err) {
      notify("Errore salvataggio Google Drive", String(err));
    } finally {
      setCloudStorageBusy(null);
    }
  };

  const handleRestoreGoogleDrive = async () => {
    if (!googleDrive?.connected) {
      setStorageModalService("googleDrive");
      return;
    }
    setCloudStorageBusy("googleDrive");
    try {
      if (googleDrive.accessToken) {
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
      } else {
        const ok = await confirm(
          "Ripristinare backup Google Drive?",
          "Seleziona il file di backup salvato dal tuo Google Drive. I dati attuali verranno sostituiti con quelli del file.",
          { confirmText: "Seleziona file", destructive: true }
        );
        if (ok) {
          const res = await pickBackup();
          if (res.ok) {
            replaceAll(res.data);
            notify("Dati ripristinati con successo per l'account Google!");
          } else if ("error" in res) {
            notify("Errore ripristino", res.error || "File non valido.");
          }
        }
      }
    } catch (err) {
      notify("Errore ripristino Google Drive", String(err));
    } finally {
      setCloudStorageBusy(null);
    }
  };

  const handleDisconnectGoogleDrive = () => {
    updateCloudStorage("googleDrive", {
      connected: false,
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      userEmail: null,
      userName: null,
    });
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

      {/* 2. Cloud WebDAV (consigliato) */}
      <SectionHeader title="Cloud WebDAV (consigliato)" />
      <Card>
        <Text style={{ color: t.textMuted, fontSize: font.small, lineHeight: 20, marginBottom: spacing.md }}>
          pCloud, Koofr, Nextcloud o qualsiasi server WebDAV: basta username e password, nessuna registrazione
          sviluppatore. I tuoi dati e i gruppi condivisi vivono in file JSON sul tuo server.
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.sm }}>
          <Text style={{ color: t.text, fontWeight: "800", fontSize: font.body, flex: 1 }}>Server WebDAV</Text>
          <View
            style={[
              styles.statusPill,
              { backgroundColor: webdav?.connected ? t.positiveSoft : t.surface },
            ]}
          >
            <Text
              style={[
                styles.statusText,
                { color: webdav?.connected ? t.positive : t.textFaint },
              ]}
            >
              {webdav?.connected ? "Connesso" : "Non collegato"}
            </Text>
          </View>
        </View>
        {webdav?.connected && webdav.lastSync ? (
          <Text style={{ color: t.textFaint, fontSize: 10, marginBottom: spacing.sm }}>
            Ultima sincronizzazione: {formatLastSync(webdav.lastSync)}
          </Text>
        ) : null}
        <TextField
          label="Server"
          value={webdavUrl}
          onChangeText={setWebdavUrl}
          placeholder="https://ewebdav.pcloud.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          hint="Preset: pCloud https://ewebdav.pcloud.com · Koofr https://app.koofr.net/dav · Nextcloud https://<server>/remote.php/dav/files/<utente>"
        />
        <TextField
          label="Email / username"
          value={webdavUser}
          onChangeText={setWebdavUser}
          placeholder="tu@esempio.com"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextField
          label="Password o app-password"
          value={webdavPassword}
          onChangeText={setWebdavPassword}
          placeholder="••••••••"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          hint="Consigliata una app-password dedicata: la condividi nei link di invito dei gruppi."
        />
        <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
          <Button
            title="Verifica connessione"
            icon="checkmark-circle-outline"
            variant="secondary"
            size="sm"
            onPress={() => void handleWebdavVerify()}
            loading={webdavBusy}
            disabled={!webdavUrl.trim() || !webdavUser.trim() || !webdavPassword}
          />
          {webdav?.connected ? (
            <Button
              title="Disconnetti"
              variant="ghost"
              size="sm"
              onPress={() => void handleWebdavDisconnect()}
            />
          ) : null}
        </View>
      </Card>

      {/* 3. Cloud Storage & Backup (Regola Studio #9) */}
      <SectionHeader title="Account & Cloud Storage (avanzato)" />
      <Card>
        <Text style={{ color: t.textMuted, fontSize: font.small, lineHeight: 20, marginBottom: spacing.md }}>
          Opzione avanzata: Google Drive e OneDrive richiedono una registrazione sviluppatore
          (Client ID configurato in fase di build). Per iniziare subito usa WebDAV qui sopra.
          Con l'account collegato puoi anche esportare i backup e ripristinarli su qualsiasi dispositivo.
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
              {oneDrive?.connected && oneDrive.accessToken ? (
                <Text
                  style={{
                    color: oneDrive.refreshToken ? t.positive : t.negative,
                    fontSize: 10,
                    fontWeight: "700",
                    marginTop: 2,
                  }}
                >
                  {tokenStatusText(oneDrive)}
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
                {oneDrive.accessToken && !oneDrive.refreshToken ? (
                  <Button
                    title="Riconnetti"
                    icon="refresh-outline"
                    variant="primary"
                    size="sm"
                    onPress={() => void handleStorageReconnect("oneDrive")}
                    loading={cloudStorageBusy === "oneDrive"}
                  />
                ) : null}
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
              {googleDrive?.connected && googleDrive.accessToken ? (
                <Text
                  style={{
                    color: googleDrive.refreshToken ? t.positive : t.negative,
                    fontSize: 10,
                    fontWeight: "700",
                    marginTop: 2,
                  }}
                >
                  {tokenStatusText(googleDrive)}
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
                {googleDrive.accessToken && !googleDrive.refreshToken ? (
                  <Button
                    title="Riconnetti"
                    icon="refresh-outline"
                    variant="primary"
                    size="sm"
                    onPress={() => void handleStorageReconnect("googleDrive")}
                    loading={cloudStorageBusy === "googleDrive"}
                  />
                ) : null}
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
        title="Condivisione & Scambio Cloud"
        right={<Button title="Ho un invito" size="sm" variant="ghost" icon="link" onPress={() => router.push("/join")} />}
      />
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.positive }} />
          <Text style={{ color: t.text, fontWeight: "800", fontSize: font.body }}>
            Cloud SplitFree: Attivo e Pronto all'uso (1-Click)
          </Text>
        </View>
        <Text style={{ color: t.textMuted, fontSize: font.small, lineHeight: 20, marginBottom: spacing.md }}>
          La condivisione in tempo reale e lo scambio di spese sono già abilitati. Puoi condividere qualsiasi gruppo con 1 tocco direttamente dalla schermata del gruppo o quando ne crei uno nuovo. Chi riceve il link entra istantaneamente con un click.
        </Text>

        <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap", marginBottom: spacing.sm }}>
          <Button
            title="Unisciti a un gruppo con link"
            icon="enter-outline"
            variant="secondary"
            size="sm"
            onPress={() => router.push("/join")}
          />
        </View>

        {/* Opzioni avanzate per sviluppatori */}
        <View style={{ borderTopWidth: 1, borderTopColor: t.border, paddingTop: spacing.md, marginTop: spacing.xs }}>
          <Pressable
            onPress={() => setShowAdvancedCloud((v) => !v)}
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
          >
            <Text style={{ color: t.textMuted, fontSize: font.tiny, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 }}>
              Opzioni avanzate (Firebase personale)
            </Text>
            <Ionicons name={showAdvancedCloud ? "chevron-up" : "chevron-down"} size={16} color={t.textMuted} />
          </Pressable>

          {showAdvancedCloud ? (
            <View style={{ marginTop: spacing.md }}>
              <Text style={{ color: t.textFaint, fontSize: font.tiny, marginBottom: spacing.sm }}>
                Se preferisci usare un tuo backend Firebase indipendente invece del cloud SplitFree predefinito, puoi collegarlo qui sotto.
              </Text>
              {settings.cloudProjects.map((p) => (
                <CloudProjectCard
                  key={p.id}
                  project={p}
                  onUpdate={(patch) => updateCloudProject(p.id, patch)}
                  onRemove={() => removeCloudProject(p.id)}
                />
              ))}

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
            </View>
          ) : null}
        </View>
      </Card>

      {/* 4. Notifiche Telegram */}
      <SectionHeader title="Notifiche Telegram" />
      <Card>
        <Text style={{ color: t.textMuted, fontSize: font.small, lineHeight: 20, marginBottom: spacing.md }}>
          Ricevi un messaggio su Telegram quando qualcuno aggiunge una spesa o un rimborso in un gruppo.
        </Text>
        <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm }}>
          <Button
            title={telegram.enabled ? "Notifiche attive" : "Notifiche disattivate"}
            icon={telegram.enabled ? "notifications" : "notifications-off-outline"}
            variant={telegram.enabled ? "primary" : "secondary"}
            size="sm"
            onPress={() => updateTelegramSettings({ enabled: !telegram.enabled })}
          />
        </View>
        <TextField
          label="Token del bot"
          value={telegram.botToken}
          onChangeText={(v) => updateTelegramSettings({ botToken: v })}
          placeholder="123456789:AAE..."
          autoCapitalize="none"
          autoCorrect={false}
        />
        {telegramBotUsername ? (
          <Text style={{ color: t.textMuted, fontSize: font.tiny, marginTop: -spacing.sm, marginBottom: spacing.sm }}>
            Bot collegato: @{telegramBotUsername}
          </Text>
        ) : null}
        <TextField
          label="Chat ID"
          value={telegram.chatId}
          onChangeText={(v) => updateTelegramSettings({ chatId: v })}
          placeholder="Es. -1001234567890"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Button
          title="Invia messaggio di prova"
          icon="paper-plane-outline"
          variant="secondary"
          size="sm"
          onPress={handleTelegramTest}
          loading={telegramTestBusy}
        />
        <Text style={{ color: t.textFaint, fontSize: font.tiny, lineHeight: 18, marginTop: spacing.md }}>
          1) Apri Telegram e scrivi a @BotFather → /newbot per creare il bot e copiare il token.{"\n"}
          2) Aggiungi il bot al gruppo Telegram dei partecipanti (o scrivigli in privato).{"\n"}
          3) Per trovare la Chat ID scrivi a @userinfobot oppure visita
          https://api.telegram.org/bot{"<TOKEN>"}/getUpdates dopo aver scritto un messaggio al bot.
        </Text>
        <Text style={{ color: t.textMuted, fontSize: font.tiny, lineHeight: 18, marginTop: spacing.sm }}>
          Lo stesso bot viene usato anche per ospitare i file dei gruppi condivisi via Telegram
          (menu del gruppo → Condividi via file → Telegram): il documento del gruppo è un file
          pinnato nella chat indicata dalla Chat ID, che dev'essere il gruppo Telegram dove sta il bot.
        </Text>
      </Card>

      {/* 5. Informazioni */}
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

      {/* 6. Zona pericolosa */}
      <SectionHeader title="Zona pericolosa" />
      <Card>
        <Button title="Cancella tutti i dati" icon="trash-outline" variant="danger" onPress={onReset} />
      </Card>

      {/* Modal di connessione rapida per Google Drive e Microsoft OneDrive */}
      {storageModalService ? (
        <CloudStorageConnectModal
          visible={!!storageModalService}
          service={storageModalService}
          initialEmail={
            (storageModalService === "oneDrive" ? oneDrive?.userEmail : googleDrive?.userEmail) || ""
          }
          initialName={name}
          initialClientId={
            (storageModalService === "oneDrive" ? oneDrive?.clientId : googleDrive?.clientId) || ""
          }
          onClose={() => setStorageModalService(null)}
          onConnect={handleStorageConnect}
        />
      ) : null}
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
