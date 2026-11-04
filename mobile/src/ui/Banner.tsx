import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react-native";
import { Icon, type IconComponent } from "./Icon";
import { Text } from "./Text";
import { useTheme } from "./theme";
import { borderWidth, radius, space, type ThemeColors } from "./tokens";

export type BannerTone = "neutral" | "info" | "success" | "warning" | "danger";

const LOOKS: Record<
  BannerTone,
  { bg: keyof ThemeColors; fg: keyof ThemeColors; border: keyof ThemeColors; icon: IconComponent }
> = {
  neutral: { bg: "muted", fg: "foreground", border: "border", icon: Info },
  info: { bg: "infoSoft", fg: "infoSoftForeground", border: "border", icon: Info },
  success: { bg: "successSoft", fg: "successSoftForeground", border: "border", icon: CircleCheck },
  warning: { bg: "warningSoft", fg: "warningSoftForeground", border: "border", icon: TriangleAlert },
  danger: { bg: "dangerSoft", fg: "dangerSoftForeground", border: "border", icon: CircleAlert },
};

export type BannerProps = {
  tone?: BannerTone;
  /** A bold first line. */
  title?: string;
  /** The message (a string, or text with a link). */
  children?: ReactNode;
  icon?: IconComponent;
  /** A button or link under the text. */
  action?: ReactNode;
  testID?: string;
};

/**
 * A message inside a screen: a form's error (`danger`, announced at once), a plan limit (`warning`), a test-mode note
 * (`info`). The website's inline alerts (`role="alert"` boxes).
 */
export function Banner({ tone = "info", title, children, icon, action, testID }: BannerProps) {
  const { colors } = useTheme();
  const look = LOOKS[tone];
  const urgent = tone === "danger" || tone === "warning";
  return (
    <View
      testID={testID}
      accessible={!action}
      accessibilityRole={urgent ? "alert" : "summary"}
      accessibilityLiveRegion={urgent ? "assertive" : "polite"}
      style={[styles.root, { backgroundColor: colors[look.bg], borderColor: colors[look.border] }]}
    >
      <View style={styles.icon}>
        <Icon icon={icon ?? look.icon} size={18} color={look.fg} />
      </View>
      <View style={styles.text}>
        {title ? (
          <Text variant="callout" weight="semibold" style={{ color: colors[look.fg] }}>
            {title}
          </Text>
        ) : null}
        {typeof children === "string" ? (
          <Text variant="callout" style={{ color: colors[look.fg] }}>
            {children}
          </Text>
        ) : (
          children
        )}
        {action ? <View style={styles.action}>{action}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space[2.5],
    borderRadius: radius.lg,
    borderWidth: borderWidth.hairline,
    paddingHorizontal: space[3],
    paddingVertical: space[2.5],
  },
  icon: { marginTop: space[0.5] },
  text: { flex: 1, gap: space[0.5] },
  action: { marginTop: space[2] },
});
