import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, Platform, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useStore } from "@/store/store";
import { useTheme } from "@/ui/theme";

export default function RootLayout() {
  const hydrated = useStore((s) => s.hydrated);
  const hydrate = useStore((s) => s.hydrate);
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
