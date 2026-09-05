import { Redirect, Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, Platform, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { cloudSyncOnCommit, cloudSyncPullOnStart } from "@/cloud/dataSync";
import { registerCloudSync, useStore } from "@/store/store";
import { useTheme } from "@/ui/theme";

// Collega lo store alla sincronizzazione cloud ("i tuoi dati nel tuo cloud"):
// registrazione sincrona a livello di modulo, così è attiva prima che hydrate()
// parta dal primo useEffect. store.ts non importa dataSync: nessun ciclo.
let cloudSyncWired = false;
function wireCloudSync() {
  if (cloudSyncWired) return;
  cloudSyncWired = true;
  registerCloudSync({ onCommit: cloudSyncOnCommit, pullOnStart: cloudSyncPullOnStart });
}
wireCloudSync();

export default function RootLayout() {
  const hydrated = useStore((s) => s.hydrated);
  const hydrate = useStore((s) => s.hydrate);
  const settings = useStore((s) => s.data.settings);
  const pathname = usePathname();
  const t = useTheme();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (Platform.OS === "web" && typeof document !== "undefined") {
      document.body.style.backgroundColor = t.bg;
      document.documentElement.style.colorScheme = t.isDark ? "dark" : "light";
    }
  }, [t]);

  if (!hydrated) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.bg }}>
        <ActivityIndicator color={t.primary} size="large" />
      </View>
    );
  }

  // Onboarding obbligatorio: senza un account cloud collegato (e senza la scelta
  // esplicita "continua senza account") l'unica schermata accessibile è /onboarding.
  const needsOnboarding =
    !settings.onboardingSkipped &&
    !settings.cloudStorage?.googleDrive?.connected &&
    !settings.cloudStorage?.oneDrive?.connected;
  if (needsOnboarding && pathname !== "/onboarding") {
    return <Redirect href="/onboarding" />;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style={t.isDark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: t.bg },
          headerTintColor: t.text,
          headerShadowVisible: false,
          headerTitleStyle: { fontWeight: "800", color: t.text },
          headerBackTitle: "Indietro",
          contentStyle: { backgroundColor: t.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="group/[id]" options={{ title: "" }} />
        <Stack.Screen name="group/edit" options={{ title: "Gruppo" }} />
        <Stack.Screen name="group/share-new" options={{ title: "Nuovo gruppo condiviso" }} />
        <Stack.Screen name="group/invite" options={{ title: "Invita persone" }} />
        <Stack.Screen name="expense/edit" options={{ title: "Spesa" }} />
        <Stack.Screen name="expense/[id]" options={{ title: "Dettaglio spesa" }} />
        <Stack.Screen name="settle/new" options={{ title: "Registra rimborso" }} />
        <Stack.Screen name="person/edit" options={{ title: "Persona" }} />
        <Stack.Screen name="join/index" options={{ title: "Unisciti a un gruppo" }} />
      </Stack>
    </SafeAreaProvider>
  );
}
