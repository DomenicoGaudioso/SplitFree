import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { Platform, type ColorValue } from "react-native";
import { useTheme } from "@/ui/theme";

type IconName = keyof typeof Ionicons.glyphMap;

function tabIcon(active: IconName, inactive: IconName) {
  return ({ color, focused, size }: { color: ColorValue; focused: boolean; size: number }) => (
    <Ionicons name={focused ? active : inactive} size={size} color={color} />
  );
}

export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.primary,
        tabBarInactiveTintColor: t.textFaint,
        tabBarStyle: {
          backgroundColor: t.tabBar,
          borderTopColor: t.border,
          height: Platform.OS === "web" ? 64 : undefined,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontWeight: "700", fontSize: 11 },
        sceneStyle: { backgroundColor: t.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: tabIcon("home", "home-outline") }} />
      <Tabs.Screen name="groups" options={{ title: "Gruppi", tabBarIcon: tabIcon("people", "people-outline") }} />
      <Tabs.Screen name="stats" options={{ title: "Statistiche", tabBarIcon: tabIcon("pie-chart", "pie-chart-outline") }} />
      <Tabs.Screen name="people" options={{ title: "Persone", tabBarIcon: tabIcon("person", "person-outline") }} />
      <Tabs.Screen name="settings" options={{ title: "Impostazioni", tabBarIcon: tabIcon("settings", "settings-outline") }} />
    </Tabs>
  );
}
