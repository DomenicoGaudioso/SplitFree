import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Stop, Text as SvgText } from "react-native-svg";
import { font, useTheme, withAlpha } from "../theme";

// ---------------------------------------------------------------------------
// Grafico a ciambella (ripartizione per categoria)
// ---------------------------------------------------------------------------

export type DonutSlice = { value: number; color: string; label: string };

export function DonutChart({
  slices,
  size = 180,
  thickness = 22,
  centerTitle,
  centerSubtitle,
}: {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  centerTitle?: string;
  centerSubtitle?: string;
}) {
  const t = useTheme();
  const total = slices.reduce((a, s) => a + s.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size}>
        <G transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={t.surfaceAlt} strokeWidth={thickness} fill="none" />
          {total > 0
            ? slices.map((s, i) => {
                const len = (s.value / total) * c;
                const gap = slices.length > 1 ? Math.min(3, len / 2) : 0;
                const el = (
                  <Circle
                    key={i}
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    stroke={s.color}
                    strokeWidth={thickness}
                    fill="none"
                    strokeDasharray={`${Math.max(0, len - gap)} ${c - Math.max(0, len - gap)}`}
                    strokeDashoffset={-offset}
                    strokeLinecap="butt"
                  />
                );
                offset += len;
                return el;
              })
            : null}
        </G>
      </Svg>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          {centerTitle ? <Text style={{ color: t.text, fontWeight: "800", fontSize: font.h3 }}>{centerTitle}</Text> : null}
          {centerSubtitle ? <Text style={{ color: t.textMuted, fontSize: font.tiny, marginTop: 2 }}>{centerSubtitle}</Text> : null}
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Grafico ad area (andamento mensile)
// ---------------------------------------------------------------------------

export type SeriesPoint = { label: string; value: number };

export function AreaChart({
  series,
  secondary,
  width,
  height = 180,
  formatValue,
  color,
  secondaryColor,
}: {
  series: SeriesPoint[];
  secondary?: SeriesPoint[];
  width: number;
  height?: number;
  formatValue: (v: number) => string;
  color?: string;
  secondaryColor?: string;
}) {
  const t = useTheme();
  const c1 = color ?? t.primary;
  const c2 = secondaryColor ?? t.positive;
  const padL = 8;
  const padR = 8;
  const padT = 18;
  const padB = 26;
  const w = Math.max(width - padL - padR, 10);
  const h = height - padT - padB;
  const n = series.length;
  const maxValue = Math.max(1, ...series.map((p) => p.value), ...(secondary ?? []).map((p) => p.value));
  const x = (i: number) => padL + (n <= 1 ? w / 2 : (i / (n - 1)) * w);
  const y = (v: number) => padT + h - (v / maxValue) * h;

  const pathFor = (pts: SeriesPoint[]) => {
    if (pts.length === 0) return "";
    let d = `M ${x(0)} ${y(pts[0].value)}`;
    for (let i = 1; i < pts.length; i++) {
      const x0 = x(i - 1);
      const x1 = x(i);
      const cx = (x0 + x1) / 2;
      d += ` C ${cx} ${y(pts[i - 1].value)}, ${cx} ${y(pts[i].value)}, ${x1} ${y(pts[i].value)}`;
    }
    return d;
  };
  const line1 = pathFor(series);
  const area1 = n > 0 ? `${line1} L ${x(n - 1)} ${padT + h} L ${x(0)} ${padT + h} Z` : "";
  const line2 = secondary ? pathFor(secondary) : "";
  const gridLines = [0.25, 0.5, 0.75, 1];
  const maxIndex = series.reduce((best, p, i) => (p.value > series[best].value ? i : best), 0);
  const labelEvery = n > 8 ? 2 : 1;

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={c1} stopOpacity={0.35} />
          <Stop offset="1" stopColor={c1} stopOpacity={0.02} />
        </LinearGradient>
      </Defs>
      {gridLines.map((g) => (
        <Line key={g} x1={padL} x2={padL + w} y1={y(maxValue * g)} y2={y(maxValue * g)} stroke={t.border} strokeWidth={1} strokeDasharray="3 4" />
      ))}
      {area1 ? <Path d={area1} fill="url(#areaFill)" /> : null}
      {line1 ? <Path d={line1} stroke={c1} strokeWidth={2.5} fill="none" strokeLinejoin="round" /> : null}
      {line2 ? <Path d={line2} stroke={c2} strokeWidth={2} fill="none" strokeDasharray="5 4" /> : null}
      {series.map((p, i) => (
        <Circle key={i} cx={x(i)} cy={y(p.value)} r={i === maxIndex ? 4.5 : 3} fill={i === maxIndex ? c1 : t.surface} stroke={c1} strokeWidth={2} />
      ))}
      {n > 0 && series[maxIndex].value > 0 ? (
        <SvgText
          x={Math.min(Math.max(x(maxIndex), padL + 30), padL + w - 30)}
          y={y(series[maxIndex].value) - 8}
          fontSize={11}
          fontWeight="700"
          fill={t.text}
          textAnchor="middle"
        >
          {formatValue(series[maxIndex].value)}
        </SvgText>
      ) : null}
      {series.map((p, i) =>
        i % labelEvery === 0 || i === n - 1 ? (
          <SvgText key={`l${i}`} x={x(i)} y={height - 8} fontSize={10} fill={t.textFaint} textAnchor="middle">
            {p.label}
          </SvgText>
        ) : null
      )}
    </Svg>
  );
}

/** Barra di avanzamento sottile (quota percentuale), non un grafico a barre di confronto. */
export function ProgressBar({ ratio, color, height = 6 }: { ratio: number; color: string; height?: number }) {
  const t = useTheme();
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: withAlpha(color, t.isDark ? 0.2 : 0.14), overflow: "hidden" }}>
      <View style={{ width: `${Math.max(0, Math.min(1, ratio)) * 100}%`, height, backgroundColor: color, borderRadius: height / 2 }} />
    </View>
  );
}
