import { StyleSheet, View } from "react-native";
import type { Tone } from "@shared/status";
import { Text } from "./Text";
import { useTheme } from "./theme";
import { radius, space, type ThemeColors } from "./tokens";

const TONES: Record<Tone, { bg: keyof ThemeColors; fg: keyof ThemeColors }> = {
  neutral: { bg: "muted", fg: "mutedForeground" },
  brand: { bg: "brandSoft", fg: "brandSoftForeground" },
  success: { bg: "successSoft", fg: "successSoftForeground" },
  warning: { bg: "warningSoft", fg: "warningSoftForeground" },
  danger: { bg: "dangerSoft", fg: "dangerSoftForeground" },
  info: { bg: "infoSoft", fg: "infoSoftForeground" },
};

/** A status pill. Tones are the website's (`@shared/status` BOOKING_STATUS / PAYMENT_STATUS give label and tone). */
export function Badge({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  const { colors } = useTheme();
  const t = TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: colors[t.bg] }]}>
      <Text variant="footnote" weight="semibold" style={{ color: colors[t.fg] }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    borderRadius: radius.full,
    paddingHorizontal: space[2],
    paddingVertical: space[0.5],
  },
});
