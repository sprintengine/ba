import { StyleSheet, View } from "react-native";
import { Text, useTheme } from "~/ui";
import { radius, space, type ThemeColors } from "~/ui/tokens";

export type MeterTone = "ok" | "low" | "out";

const BAR: Record<MeterTone, keyof ThemeColors> = { ok: "brand", low: "warning", out: "danger" };

/**
 * A usage bar (the website's UsageMeter and CreditsMeter): the label and "used / limit" above a bar whose colour
 * follows how much is left. One accessible element: a progress bar with its numbers, and `valueText` when given.
 */
export function Meter({
  label,
  value,
  used,
  limit,
  percent,
  tone,
  valueText,
  testID,
}: {
  label: string;
  /** The numbers shown ("41 / 500"). */
  value: string;
  used: number;
  limit: number;
  /** 0–100. */
  percent: number;
  tone: MeterTone;
  valueText?: string;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={styles.root}
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: limit, now: Math.min(used, limit), text: valueText ?? value }}
    >
      <View style={styles.row}>
        <Text variant="callout" tone="muted" style={styles.label}>
          {label}
        </Text>
        <Text variant="callout" weight="medium" numeric>
          {value}
        </Text>
      </View>
      <View style={[styles.track, { backgroundColor: colors.muted }]}>
        <View style={[styles.bar, { width: `${percent}%`, backgroundColor: colors[BAR[tone]] }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space[2] },
  row: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space[3] },
  label: { flexShrink: 1 },
  track: { height: space[2], borderRadius: radius.full, overflow: "hidden" },
  bar: { height: "100%", borderRadius: radius.full },
});
