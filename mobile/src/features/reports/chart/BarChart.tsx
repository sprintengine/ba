import { useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  View,
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
} from "react-native";
import Svg, { Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { Text, useLayout, useTheme } from "~/ui";
import { fontFamily, radius, space, typeScale } from "~/ui/tokens";
import { barAt, barPath, chartGeometry, TICK_SLOT } from "./geometry";

export type BarDatum = { key: string; value: number };

export type BarChartProps = {
  data: BarDatum[];
  /** The y-axis tick text (a count, "€50", "1.2K"). */
  formatTick: (value: number) => string;
  /** The x-axis label under a bar ("1 Oct"). */
  formatLabel: (key: string) => string;
  /** What a pressed bar (or VoiceOver on it) says: its date and value ("Thu, 1 Oct 2026", "2 appointments"). */
  describe: (datum: BarDatum) => { title: string; value: string };
  /** The chart as one sentence (the website's aria-label): what it shows, and that the table has exact values. */
  accessibilityLabel: string;
  /** Room for the y-axis tick labels. */
  axisWidth: number;
  height: number;
  /** Whole-number ticks (counts, cents). */
  integer?: boolean;
  testID?: string;
};

const LABEL_HEIGHT = typeScale.caption.lineHeight + space[1];
const FONT = typeScale.caption.fontSize;

/**
 * A single-series column chart drawn with react-native-svg (no chart library): bars in the brand colour from one
 * baseline with rounded data-ends, hairline gridlines at clean ticks, date labels thinned to fit the width. Press a
 * column to see its value; VoiceOver users swipe up/down through the days (an adjustable element). Nothing animates.
 * The geometry is computed once per data/size change.
 */
export function BarChart({
  data,
  formatTick,
  formatLabel,
  describe,
  accessibilityLabel,
  axisWidth,
  height,
  integer = true,
  testID,
}: BarChartProps) {
  const { colors } = useTheme();
  const window = useLayout();
  // A first guess until the real width is measured, so the chart draws on the first frame.
  const [measured, setMeasured] = useState(0);
  const width = measured || Math.max(0, window.width - space[16]);
  // A selection belongs to one series: switching measure or range clears it without an effect.
  const [selection, setSelection] = useState<{ data: BarDatum[]; index: number } | null>(null);
  const selected = selection?.data === data ? selection.index : null;

  const geometry = useMemo(
    () =>
      chartGeometry({
        values: data.map((d) => d.value),
        width,
        height,
        axisWidth,
        labelHeight: LABEL_HEIGHT,
        integer,
      }),
    [data, width, height, axisWidth, integer],
  );
  const paths = useMemo(() => geometry.bars.map((bar) => barPath(bar)), [geometry]);

  const select = (index: number | null) =>
    setSelection(index === null || index === selected ? null : { data, index });
  const step = (by: number) => {
    if (data.length === 0) return;
    const from = selected ?? (by > 0 ? -1 : data.length);
    setSelection({ data, index: Math.min(data.length - 1, Math.max(0, from + by)) });
  };
  const onAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === "increment") step(1);
    if (e.nativeEvent.actionName === "decrement") step(-1);
  };

  const current = selected !== null ? data[selected] : undefined;
  const info = current ? describe(current) : null;
  const bar = selected !== null ? geometry.bars[selected] : undefined;
  const center = bar ? bar.slotX + bar.slotWidth / 2 : 0;
  const { plot } = geometry;
  const baseline = plot.top + plot.height;

  return (
    <View
      testID={testID}
      style={{ height }}
      onLayout={(e: LayoutChangeEvent) => setMeasured(e.nativeEvent.layout.width)}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="Swipe up or down to hear each day."
      accessibilityValue={info ? { text: `${info.title}: ${info.value}` } : undefined}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={onAction}
    >
      <Svg width={width} height={height}>
        {geometry.ticks.map((t) => (
          <Line
            key={`grid-${t.value}`}
            x1={plot.left}
            x2={plot.left + plot.width}
            y1={t.y}
            y2={t.y}
            stroke={t.y === baseline ? colors.borderStrong : colors.border}
            strokeWidth={StyleSheet.hairlineWidth}
          />
        ))}
        {geometry.ticks.map((t) => (
          <SvgText
            key={`tick-${t.value}`}
            x={plot.left - space[1.5]}
            y={t.y + FONT / 3}
            fontSize={FONT}
            fontFamily={fontFamily.regular}
            fill={colors.subtleForeground}
            textAnchor="end"
          >
            {formatTick(t.value)}
          </SvgText>
        ))}
        {bar ? (
          <Rect
            x={bar.slotX}
            y={plot.top}
            width={bar.slotWidth}
            height={plot.height}
            fill={colors.accent}
            opacity={0.8}
          />
        ) : null}
        {paths.map((d, i) =>
          d ? (
            <Path key={data[i]?.key ?? i} d={d} fill={i === selected ? colors.brandPressed : colors.brand} />
          ) : null,
        )}
        {geometry.labels.map((i) => {
          const b = geometry.bars[i];
          const datum = data[i];
          if (!b || !datum) return null;
          const x = b.slotX + b.slotWidth / 2;
          // The last label can't hang past the right edge.
          const end = x + TICK_SLOT / 2 > width;
          return (
            <SvgText
              key={`label-${datum.key}`}
              x={end ? width : x}
              y={baseline + LABEL_HEIGHT - space[0.5]}
              fontSize={FONT}
              fontFamily={fontFamily.regular}
              fill={colors.subtleForeground}
              textAnchor={end ? "end" : "middle"}
            >
              {formatLabel(datum.key)}
            </SvgText>
          );
        })}
      </Svg>
      <Pressable
        testID={testID ? `${testID}-plot` : undefined}
        style={StyleSheet.absoluteFill}
        onPress={(e) => select(barAt(geometry, e.nativeEvent.locationX))}
      />
      {info && bar ? (
        <View
          pointerEvents="none"
          testID={testID ? `${testID}-tooltip` : undefined}
          style={[
            styles.tooltip,
            { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
            center < width / 2
              ? { left: Math.max(0, center - space[4]) }
              : { right: Math.max(0, width - center - space[4]) },
          ]}
        >
          <View style={styles.valueRow}>
            <View style={[styles.key, { backgroundColor: colors.brand }]} />
            <Text variant="callout" weight="semibold" numeric>
              {info.value}
            </Text>
          </View>
          <Text variant="footnote" tone="muted">
            {info.title}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tooltip: {
    position: "absolute",
    top: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    gap: space[0.5],
  },
  valueRow: { flexDirection: "row", alignItems: "center", gap: space[1.5] },
  key: { width: space[3], height: space[0.5], borderRadius: radius.full },
});
