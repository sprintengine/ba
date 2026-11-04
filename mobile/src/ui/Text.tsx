import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from "react-native";
import { useTheme } from "./theme";
import { fontFamily, typeScale, type FontWeightName, type TextVariant } from "./tokens";

export type TextTone =
  | "default"
  | "muted"
  | "subtle"
  | "brand"
  | "primaryForeground"
  | "brandForeground"
  | "success"
  | "warning"
  | "danger"
  | "info";

export type TextProps = RNTextProps & {
  variant?: TextVariant;
  tone?: TextTone;
  weight?: FontWeightName;
  align?: TextStyle["textAlign"];
  /** Tabular figures for times, prices and counts (they don't jiggle as they change). */
  numeric?: boolean;
};

/**
 * All text in the app. Scales with the system text size (Dynamic Type), capped per variant; titles are announced as
 * headings (`accessibilityRole="header"`) unless told otherwise.
 */
export function Text({
  variant = "body",
  tone = "default",
  weight,
  align,
  numeric,
  style,
  accessibilityRole,
  ...rest
}: TextProps) {
  const { colors } = useTheme();
  const t = typeScale[variant];
  const color = {
    default: colors.foreground,
    muted: colors.mutedForeground,
    subtle: colors.subtleForeground,
    brand: colors.brand,
    primaryForeground: colors.primaryForeground,
    brandForeground: colors.brandForeground,
    success: colors.successSoftForeground,
    warning: colors.warningSoftForeground,
    danger: colors.dangerSoftForeground,
    info: colors.infoSoftForeground,
  }[tone];
  const isTitle = variant === "title1" || variant === "title2" || variant === "title3";
  return (
    <RNText
      maxFontSizeMultiplier={t.maxScale}
      accessibilityRole={accessibilityRole ?? (isTitle ? "header" : undefined)}
      style={[
        {
          color,
          fontFamily: fontFamily[weight ?? t.weight],
          fontSize: t.fontSize,
          lineHeight: t.lineHeight,
          letterSpacing: t.letterSpacing,
          textAlign: align,
          fontVariant: numeric ? ["tabular-nums"] : undefined,
        },
        style,
      ]}
      {...rest}
    />
  );
}
