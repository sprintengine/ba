import { StyleSheet, View } from "react-native";
import { useTheme } from "~/ui";
import { radius, space, type ThemeColors } from "~/ui/tokens";

export type MeterTone = "brand" | "warning" | "danger";

const LOOK: Record<MeterTone, { fill: keyof ThemeColors; track: keyof ThemeColors }> = {
  brand: { fill: "brand", track: "brandSoft" },
  warning: { fill: "warning", track: "warningSoft" },
  danger: { fill: "danger", track: "dangerSoft" },
};

export type MeterProps = {
  /** 0–100: how much of the bar is filled. */
  percent: number;
  tone?: MeterTone;
  /**
   * What the meter measures, for screen readers ("Alex Morgan utilisation"). Without it the bar is decorative (the
   * numbers beside it say everything).
   */
  accessibilityLabel?: string;
  /** The reading: `now` between `min` and `max`, and optionally how to say it ("27 credits left"). */
  value?: { min: number; max: number; now: number; text?: string };
  testID?: string;
};

/**
 * A horizontal meter (the website's `role="meter"` bars): the fill carries the severity, the track is a lighter step
 * of the same colour so the state reads across the whole bar. A progress bar to assistive tech when labelled.
 */
export function Meter({ percent, tone = "brand", accessibilityLabel, value, testID }: MeterProps) {
  const { colors } = useTheme();
  const look = LOOK[tone];
  const pct = Math.max(0, Math.min(100, percent));
  const a11y = accessibilityLabel
    ? {
        accessible: true,
        accessibilityRole: "progressbar" as const,
        accessibilityLabel,
        accessibilityValue: value ?? { min: 0, max: 100, now: Math.round(pct) },
      }
    : { accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants" as const };
  return (
    <View testID={testID} style={[styles.track, { backgroundColor: colors[look.track] }]} {...a11y}>
      {pct > 0 ? (
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: colors[look.fill] }]} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: space[2], borderRadius: radius.full, overflow: "hidden" },
  fill: { height: "100%", borderRadius: radius.full },
});
