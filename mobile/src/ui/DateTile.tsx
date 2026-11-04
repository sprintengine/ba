import { StyleSheet, View } from "react-native";
import { formatDate, type PlainDate } from "@shared/format";
import { Text } from "./Text";
import { useTheme } from "./theme";
import { borderWidth, radius, space } from "./tokens";

/**
 * A tear-off calendar tile for a date: weekday, day, month (the website's DateTile, in the brand colour inside a
 * `<BrandScope>`). Decorative: the date is also in the text beside it.
 */
export function DateTile({
  date,
  timeZone,
  muted = false,
}: {
  date: PlainDate;
  timeZone: string;
  muted?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.tile,
        { borderColor: colors.border, backgroundColor: colors.surface, opacity: muted ? 0.6 : 1 },
      ]}
    >
      <View style={[styles.top, { backgroundColor: colors.brand }]}>
        <Text variant="caption" tone="brandForeground" align="center" maxFontSizeMultiplier={1.2}>
          {formatDate(date, timeZone, "weekday").toUpperCase()}
        </Text>
      </View>
      <Text variant="title3" weight="bold" align="center" numeric maxFontSizeMultiplier={1.2}>
        {Number(date.slice(8))}
      </Text>
      <Text variant="caption" tone="muted" align="center" maxFontSizeMultiplier={1.2} style={styles.month}>
        {(formatDate(date, timeZone, "short").split(" ")[1] ?? "").toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: space[16] - space[2],
    borderRadius: radius.xl,
    borderWidth: borderWidth.hairline,
    overflow: "hidden",
  },
  top: { paddingVertical: space[0.5] },
  month: { paddingBottom: space[1] },
});
