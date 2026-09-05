import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import {
  DEFAULT_GOOGLE_CLIENT_ID,
  DEFAULT_MICROSOFT_CLIENT_ID,
  isPlaceholderClientId,
} from "@/cloud/defaultConfig";
import { pullAppDataIfNewer } from "@/cloud/dataSync";
import { connectGoogleDriveAccount } from "@/cloud/googleDriveSync";
import { connectOneDriveAccount } from "@/cloud/oneDriveSync";
import { WEBDAV_DIR, webdavMkcol, webdavTestConnection, type WebDavConfig } from "@/cloud/fileShare/webdav";
import type { FileShareProvider } from "@/domain/types";
import { useStore } from "@/store/store";
import { Button, Card, Screen, TextField } from "@/ui/components";
import { font, radius, spacing, useTheme } from "@/ui/theme";

/** Preset di server WebDAV comuni: nessuna registrazione sviluppatore richiesta. */
const WEBDAV_PRESETS = [
  { label: "pCloud", url: "https://ewebdav.pcloud.com" },
  { label: "Koofr", url: "https://app.koofr.net/dav" },
  { label: "Nextcloud", url: "" },
];

/**
 * Onboarding obbligatorio: "i tuoi dati nel tuo cloud".
 * La via consigliata è WebDAV (pCloud, Koofr, Nextcloud…): basta username e
 * password, nessuna registrazione app. In alternativa Google Drive / OneDrive
 * (richiedono un Client ID registrato) oppure si continua senza account.
 */
export default function OnboardingScreen() {
  const t = useTheme();
  const router = useRouter();
  const updateCloudStorage = useStore((s) => s.updateCloudStorage);
  const updateWebdavSettings = useStore((s) => s.updateWebdavSettings);
  const updateSettings = useStore((s) => s.updateSettings);

  const [busy, setBusy] = useState<FileShareProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showWebdavForm, setShowWebdavForm] = useState(false);
  const [webdavUrl, setWebdavUrl] = useState(WEBDAV_PRESETS[0].url);
  const [webdavUser, setWebdavUser] = useState("");
  const [webdavPassword, setWebdavPassword] = useState("");

  async function handleConnectWebdav() {
    setError(null);
    const cfg: WebDavConfig = {
      url: webdavUrl.trim(),
      username: webdavUser.trim(),
      password: webdavPassword,
    };
    setBusy("webdav");
    try {
      const test = await webdavTestConnection(cfg);
      if (!test.ok) {
        setError(test.error || "Connessione WebDAV non riuscita. Riprova.");
        return;
      }
      updateWebdavSettings({ ...cfg, connected: true, lastSync: null });
      // Prepara la cartella dei dati; un fallimento qui non blocca l'ingresso.
      try {
        await webdavMkcol(cfg, WEBDAV_DIR);
      } catch (err) {
        console.warn("Creazione cartella WebDAV non riuscita", err);
      }
      // Prima apertura con l'account: scarica i dati dal cloud se esistono già,
      // altrimenti carica quelli locali. Un errore qui non blocca l'ingresso.
      try {
        await pullAppDataIfNewer("webdav");
      } catch (err) {
        console.warn("Sincronizzazione iniziale non riuscita", err);
      }
      router.replace("/");
    } catch (err) {
      setError(String(err).replace(/^Error:\s*/, "") || "Connessione non riuscita. Riprova.");
    } finally {
      setBusy(null);
    }
  }

  async function handleConnect(provider: FileShareProvider) {
    setError(null);
    const isGoogle = provider === "gdrive";
    const clientId = isGoogle ? DEFAULT_GOOGLE_CLIENT_ID : DEFAULT_MICROSOFT_CLIENT_ID;

    if (isPlaceholderClientId(clientId)) {
      setError(
        isGoogle
          ? "Per collegare Google Drive serve un Client ID registrato su Google Cloud Console. Configura la variabile EXPO_PUBLIC_GOOGLE_CLIENT_ID in fase di build (vedi README) e riavvia l'app, oppure continua senza account."
          : "Per collegare OneDrive serve un Application (Client) ID registrato su Microsoft Azure. Configura la variabile EXPO_PUBLIC_MICROSOFT_CLIENT_ID in fase di build (vedi README) e riavvia l'app, oppure continua senza account."
      );
      return;
    }

    setBusy(provider);
    try {
      const account = isGoogle
        ? await connectGoogleDriveAccount(clientId)
        : await connectOneDriveAccount(clientId);

      updateCloudStorage(isGoogle ? "googleDrive" : "oneDrive", {
        connected: true,
        userEmail: account.email,
        userName: account.name,
        accessToken: account.accessToken,
        refreshToken: account.refreshToken,
        expiresAt: account.expiresAt,
        clientId,
        lastSync: null,
      });

      // Prima apertura con l'account: scarica i dati dal cloud se esistono già,
      // altrimenti carica quelli locali. Un errore qui non blocca l'ingresso.
      try {
        await pullAppDataIfNewer(provider);
      } catch (err) {
        console.warn("Sincronizzazione iniziale non riuscita", err);
      }

      router.replace("/");
    } catch (err) {
      setError(String(err).replace(/^Error:\s*/, "") || "Connessione non riuscita. Riprova.");
    } finally {
      setBusy(null);
    }
  }

  function handleSkip() {
    updateSettings({ onboardingSkipped: true });
    router.replace("/");
  }

  return (
    <Screen scroll={showWebdavForm}>
      <View style={styles.container}>
        <View style={styles.hero}>
          <Image source={require("../assets/icon.png")} style={styles.logo} />
          <Text style={[styles.title, { color: t.text }]}>SplitFree</Text>
          <Text style={[styles.tagline, { color: t.textMuted }]}>
            I tuoi dati vivono nel tuo cloud: collega un account per iniziare.
          </Text>
        </View>

        <Card>
          <View style={styles.cardBody}>
            <View style={styles.pointRow}>
              <Ionicons name="cloud-outline" size={20} color={t.primary} />
              <Text style={[styles.pointText, { color: t.textMuted }]}>
                Le tue spese sono salvate in un file sul tuo cloud (WebDAV, Google Drive o OneDrive): nessun server di terzi.
              </Text>
            </View>
            <View style={styles.pointRow}>
              <Ionicons name="phone-portrait-outline" size={20} color={t.primary} />
              <Text style={[styles.pointText, { color: t.textMuted }]}>
                Funziona anche offline: il dispositivo tiene una copia locale e sincronizza appena torni online.
              </Text>
            </View>

            {error ? <Text style={[styles.errorText, { color: t.negative }]}>{error}</Text> : null}

            <Button
              title={busy === "webdav" ? "Connessione al server…" : "Continua con pCloud / WebDAV (consigliato)"}
              icon="server-outline"
              size="lg"
              fullWidth
              onPress={() => setShowWebdavForm((v) => !v)}
              loading={busy === "webdav"}
              disabled={busy !== null}
            />

            {showWebdavForm ? (
              <View style={styles.webdavForm}>
                <View style={styles.presetRow}>
                  {WEBDAV_PRESETS.map((preset) => (
                    <Pressable
                      key={preset.label}
                      onPress={() => setWebdavUrl(preset.url)}
                      style={[
                        styles.presetChip,
                        {
                          borderColor: webdavUrl === preset.url && preset.url ? t.primary : t.border,
                          backgroundColor: webdavUrl === preset.url && preset.url ? t.primarySoft : t.surface,
                        },
                      ]}
                    >
                      <Text style={{ color: t.text, fontSize: font.small, fontWeight: "600" }}>{preset.label}</Text>
                    </Pressable>
                  ))}
                </View>
                <TextField
                  label="Server WebDAV"
                  value={webdavUrl}
                  onChangeText={setWebdavUrl}
                  placeholder="https://ewebdav.pcloud.com"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  hint="Per Nextcloud: https://<server>/remote.php/dav/files/<utente>"
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
                  hint="Consigliata una app-password dedicata (pCloud, Koofr e Nextcloud la offrono)."
                />
                <Button
                  title="Connetti e verifica"
                  icon="checkmark-circle-outline"
                  fullWidth
                  onPress={() => void handleConnectWebdav()}
                  loading={busy === "webdav"}
                  disabled={busy !== null || !webdavUrl.trim() || !webdavUser.trim() || !webdavPassword}
                />
              </View>
            ) : null}

            <Button
              title={busy === "gdrive" ? "Connessione a Google…" : "Continua con Google Drive"}
              icon="logo-google"
              variant="secondary"
              size="lg"
              fullWidth
              onPress={() => void handleConnect("gdrive")}
              loading={busy === "gdrive"}
              disabled={busy !== null}
            />
            <Button
              title={busy === "onedrive" ? "Connessione a Microsoft…" : "Continua con OneDrive"}
              icon="logo-microsoft"
              variant="secondary"
              size="lg"
              fullWidth
              onPress={() => void handleConnect("onedrive")}
              loading={busy === "onedrive"}
              disabled={busy !== null}
            />
            <Text style={[styles.advancedNote, { color: t.textFaint }]}>
              Google Drive e OneDrive richiedono una registrazione sviluppatore: usa WebDAV per iniziare subito.
            </Text>
          </View>
        </Card>

        <Button
          title="Continua senza account (dati solo su questo dispositivo)"
          variant="ghost"
          size="sm"
          onPress={handleSkip}
          disabled={busy !== null}
          style={styles.skipLink}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    gap: spacing.lg,
    paddingVertical: spacing.xxl,
  },
  hero: {
    alignItems: "center",
    gap: spacing.sm,
  },
  logo: {
    width: 84,
    height: 84,
    borderRadius: radius.lg,
  },
  title: {
    fontSize: font.h1,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: font.body,
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 420,
  },
  cardBody: {
    gap: spacing.md,
  },
  pointRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  pointText: {
    flex: 1,
    fontSize: font.small,
    lineHeight: 19,
  },
  errorText: {
    fontSize: font.small,
    lineHeight: 18,
  },
  webdavForm: {
    gap: spacing.sm,
  },
  presetRow: {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  presetChip: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  advancedNote: {
    fontSize: font.tiny,
    lineHeight: 16,
    textAlign: "center",
  },
  skipLink: {
    alignSelf: "center",
  },
});
