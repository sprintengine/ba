import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { CircleAlert } from "lucide-react-native";
import { Icon, type IconComponent, Text, useTheme } from "~/ui";
import { borderWidth, radius, space, type ThemeColors } from "~/ui/tokens";

type Tone = "neutral" | "warning" | "danger" | "info" | "success" | "dashed";

const TONES: Record<Tone, { bg: keyof ThemeColors; fg: keyof ThemeColors; border: keyof ThemeColors }> = {
  neutral: { bg: "surface", fg: "foreground", border: "border" },
  dashed: { bg: "surfaceSunken", fg: "foreground", border: "borderStrong" },
  warning: { bg: "warningSoft", fg: "warningSoftForeground", border: "warning" },
  danger: { bg: "dangerSoft", fg: "dangerSoftForeground", border: "danger" },
  info: { bg: "infoSoft", fg: "infoSoftForeground", border: "info" },
  success: { bg: "successSoft", fg: "successSoftForeground", border: "success" },
};

/**
 * A message box in the flow: a time that was just taken, why booking failed, a day that isn't open yet. `alert`
 * announces it as it appears (role alert / live region).
 */
export function Callout({
  tone = "neutral",
  icon,
  title,
  children,
  action,
  alert = false,
  testID,
}: {
  tone?: Tone;
  icon?: IconComponent | null;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  alert?: boolean;
  testID?: string;
}) {
  const { colors } = useTheme();
  const t = TONES[tone];
  const glyph = icon === undefined ? (tone === "warning" || tone === "danger" ? CircleAlert : null) : icon;
  return (
    <View
      testID={testID}
      accessibilityRole={alert ? "alert" : undefined}
      accessibilityLiveRegion={alert ? "polite" : "none"}
      style={[
        styles.box,
        {
          backgroundColor: colors[t.bg],
          borderColor:
            tone === "dashed"
              ? colors[t.border]
              : colors[t.bg] === colors.surface
                ? colors.border
                : colors[t.bg],
          borderStyle: tone === "dashed" ? "dashed" : "solid",
        },
      ]}
    >
      <View style={styles.row}>
        {glyph ? <Icon icon={glyph} size={18} color={t.fg} /> : null}
        <View style={styles.text}>
          {title ? (
            <Text variant="callout" weight="semibold" style={{ color: colors[t.fg] }}>
              {title}
            </Text>
          ) : null}
          {typeof children === "string" ? (
            <Text
              variant="callout"
              style={{
                color: tone === "neutral" || tone === "dashed" ? colors.mutedForeground : colors[t.fg],
              }}
            >
              {children}
            </Text>
          ) : (
            children
          )}
        </View>
      </View>
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.xl, borderWidth: borderWidth.hairline, padding: space[4], gap: space[3] },
  row: { flexDirection: "row", gap: space[3], alignItems: "flex-start" },
  text: { flex: 1, gap: space[1] },
  action: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
});
