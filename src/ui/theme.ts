import { Platform, useColorScheme, type ViewStyle } from "react-native";
import { useStore } from "@/store/store";

export type Palette = {
  isDark: boolean;
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  textFaint: string;
  primary: string;
  primarySoft: string;
  onPrimary: string;
  positive: string;
  positiveSoft: string;
  negative: string;
  negativeSoft: string;
  warning: string;
  warningSoft: string;
  shadow: string;
  tabBar: string;
  header: string;
  headerText: string;
};

export const LIGHT: Palette = {
  isDark: false,
  bg: "#F3F5FA",
  surface: "#FFFFFF",
  surfaceAlt: "#EEF1F8",
  border: "#E3E7F0",
  text: "#0F172A",
  textMuted: "#64748B",
  textFaint: "#94A3B8",
  primary: "#4F46E5",
  primarySoft: "#EEF0FF",
  onPrimary: "#FFFFFF",
  positive: "#15803D",
  positiveSoft: "#DCFCE7",
  negative: "#DC2626",
  negativeSoft: "#FEE2E2",
  warning: "#B45309",
  warningSoft: "#FEF3C7",
  shadow: "#0F172A",
  tabBar: "#FFFFFF",
  header: "#0F172A",
  headerText: "#FFFFFF",
};

export const DARK: Palette = {
  isDark: true,
  bg: "#0B1120",
  surface: "#141C2F",
  surfaceAlt: "#1B2540",
  border: "#26314D",
  text: "#F1F5F9",
  textMuted: "#A3B0C6",
  textFaint: "#6B7A94",
  primary: "#818CF8",
  primarySoft: "#23244B",
  onPrimary: "#0B1120",
  positive: "#4ADE80",
  positiveSoft: "#143222",
  negative: "#F87171",
  negativeSoft: "#3B1A1A",
  warning: "#FBBF24",
  warningSoft: "#3A2A0B",
  shadow: "#000000",
  tabBar: "#0F172A",
  header: "#0F172A",
  headerText: "#F1F5F9",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
};

export const font = {
  display: 34,
  h1: 26,
  h2: 20,
  h3: 17,
  body: 15,
  small: 13,
  tiny: 11,
};

export function useTheme(): Palette {
  const pref = useStore((s) => s.data.settings.theme);
  const system = useColorScheme();
  const dark = pref === "dark" || (pref === "system" && system === "dark");
  return dark ? DARK : LIGHT;
}

/** Colore del testo con cui rendere un importo netto. */
export function amountColor(minor: number, t: Palette): string {
  if (minor > 0) return t.positive;
  if (minor < 0) return t.negative;
  return t.textMuted;
}

/** Ombra coerente fra piattaforme: boxShadow su web, shadow ed elevation su nativo. */
export function shadow(color: string, opacity: number, blur: number, offsetY: number, elevation = 2): ViewStyle {
  if (Platform.OS === "web") {
    return { boxShadow: `0 ${offsetY}px ${blur}px ${withAlpha(color, opacity)}` } as ViewStyle;
  }
  return { shadowColor: color, shadowOpacity: opacity, shadowRadius: blur / 2, shadowOffset: { width: 0, height: offsetY }, elevation };
}

export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
