import { StyleSheet, View } from "react-native";
import { Icon, Text, useTheme, type IconComponent } from "~/ui";
import { radius, space, type ThemeColors } from "~/ui/tokens";

export type StatusTone = "success" | "warning" | "info" | "neutral";

const TONES: Record<StatusTone, { bg: keyof ThemeColors; fg: keyof ThemeColors }> = {
  success: { bg: "successSoft", fg: "successSoftForeground" },
  warning: { bg: "warningSoft", fg: "warningSoftForeground" },
  info: { bg: "infoSoft", fg: "infoSoftForeground" },
  neutral: { bg: "muted", fg: "mutedForeground" },
};

/**
 * A status row (the website's settings-common StatusLine): a toned icon tile, a title and one line of explanation.
 * Read as one sentence ("Ready to take payments. Refunds…"); the tone is never the only signal, the title says it.
 */
export function StatusLine({
  tone,
  icon,
  title,
  text,
  testID,
}: {
  tone: StatusTone;
  icon: IconComponent;
  title: string;
  text: string;
  testID?: string;
}) {
  const { colors } = useTheme();
  const t = TONES[tone];
  return (
    <View style={styles.row} accessible accessibilityLabel={`${title}. ${text}`} testID={testID}>
      <View style={[styles.tile, { backgroundColor: colors[t.bg] }]}>
        <Icon icon={icon} size={18} color={t.fg} />
      </View>
      <View style={styles.text}>
        <Text variant="callout" weight="medium">
          {title}
        </Text>
        <Text variant="callout" tone="muted">
          {text}
        </Text>
      </View>
    </View>
  );
}

/** 36pt, the website's size-9 tile. */
const TILE = space[8] + space[1];

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: space[3] },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { flex: 1, gap: space[0.5] },
});
