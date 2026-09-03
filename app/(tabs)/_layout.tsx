import { Ionicons } from "@expo/vector-icons";
import { Slot, usePathname, useRouter } from "expo-router";
import { useMemo, useRef } from "react";
import { PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { font, shadow, spacing, useTheme } from "@/ui/theme";

type IconName = keyof typeof Ionicons.glyphMap;

type TabDef = {
  path: "/" | "/groups" | "/stats" | "/people" | "/settings";
  label: string;
  icon: IconName;
  activeIcon: IconName;
};

const TABS: TabDef[] = [
  { path: "/", label: "Home", icon: "home-outline", activeIcon: "home" },
  { path: "/groups", label: "Gruppi", icon: "people-outline", activeIcon: "people" },
  { path: "/stats", label: "Statistiche", icon: "pie-chart-outline", activeIcon: "pie-chart" },
  { path: "/people", label: "Persone", icon: "person-outline", activeIcon: "person" },
  { path: "/settings", label: "Impostazioni", icon: "settings-outline", activeIcon: "settings" },
];

// Distanza minima di trascinamento orizzontale, in pixel, perché un gesto
// venga considerato uno swipe di cambio scheda invece di un semplice tocco
// o di uno scorrimento verticale del contenuto.
const SWIPE_THRESHOLD = 56;

/**
 * Barra di navigazione IN ALTO invece che in basso: sullo schermo del
 * telefono, in basso ci sono già i pulsanti di sistema di Android (o
 * l'indicatore gesture di iOS), e sovrapporre un'altra barra lì crea
 * confusione e tocchi accidentali. Si passa da una scheda all'altra anche
 * trascinando il dito a destra o sinistra sul contenuto, non solo toccando
 * le voci in alto.
 */
export default function TabsLayout() {
  const t = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const activeIndex = Math.max(
    0,
    TABS.findIndex((tab) => tab.path === pathname)
  );

  const goToIndex = (index: number) => {
    const clamped = Math.max(0, Math.min(TABS.length - 1, index));
    if (clamped === activeIndex) return;
    router.replace(TABS[clamped].path);
  };

  // useRef per leggere sempre l'indice corrente dentro i callback del
  // PanResponder, che altrimenti catturerebbero il valore della prima resa.
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Fase di "capture": intercetta il gesto prima che lo scorrimento
        // verticale del contenuto sottostante lo consumi, ma solo quando è
        // chiaramente un movimento orizzontale (altrimenti lo scroll normale
        // continua a funzionare senza interferenze).
        onMoveShouldSetPanResponderCapture: (_evt, gesture) =>
          Math.abs(gesture.dx) > 16 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
        onPanResponderRelease: (_evt, gesture) => {
          if (gesture.dx <= -SWIPE_THRESHOLD) goToIndex(activeIndexRef.current + 1);
          else if (gesture.dx >= SWIPE_THRESHOLD) goToIndex(activeIndexRef.current - 1);
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={[styles.bar, { backgroundColor: t.tabBar, borderBottomColor: t.border, paddingTop: insets.top }]}>
        <View style={styles.barRow}>
          {TABS.map((tab, i) => {
            const active = i === activeIndex;
            return (
              <Pressable key={tab.path} role="button" onPress={() => goToIndex(i)} style={styles.item}>
                <Ionicons name={active ? tab.activeIcon : tab.icon} size={21} color={active ? t.primary : t.textFaint} />
                <Text style={[styles.label, { color: active ? t.primary : t.textFaint }]} numberOfLines={1}>
                  {tab.label}
                </Text>
                <View style={[styles.indicator, { backgroundColor: active ? t.primary : "transparent" }]} />
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={{ flex: 1 }} {...panResponder.panHandlers}>
        <Slot />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    ...shadow("#0F172A", 0.04, 6, 1, 1),
  },
  barRow: { flexDirection: "row" },
  item: { flex: 1, alignItems: "center", paddingTop: 8, paddingBottom: 9 },
  label: { fontSize: font.tiny, fontWeight: "700", marginTop: 2 },
  indicator: { marginTop: 7, height: 3, width: 22, borderRadius: 2 },
});
