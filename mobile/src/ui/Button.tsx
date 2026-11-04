import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps } from "react-native";
import { Icon, type IconComponent } from "./Icon";
import { Text } from "./Text";
import { useTheme } from "./theme";
import { MIN_TOUCH, radius, space, type ThemeColors } from "./tokens";

export type ButtonVariant = "primary" | "brand" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = Omit<PressableProps, "children" | "style"> & {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconComponent;
  /** Shows a spinner and blocks presses (a mutation in flight). */
  loading?: boolean;
  fullWidth?: boolean;
};

type Look = {
  bg: keyof ThemeColors | null;
  pressed: keyof ThemeColors;
  fg: keyof ThemeColors;
  border?: keyof ThemeColors;
};

const LOOKS: Record<ButtonVariant, Look> = {
  primary: { bg: "primary", pressed: "primaryPressed", fg: "primaryForeground" },
  brand: { bg: "brand", pressed: "brandPressed", fg: "brandForeground" },
  secondary: { bg: "surface", pressed: "muted", fg: "foreground", border: "borderStrong" },
  ghost: { bg: null, pressed: "muted", fg: "foreground" },
  destructive: { bg: "danger", pressed: "dangerPressed", fg: "dangerForeground" },
};

const HEIGHT: Record<ButtonSize, number> = { sm: 36, md: MIN_TOUCH, lg: 52 };

/** The app's button. Small buttons keep a 44pt touch target through `hitSlop`. */
export function Button({
  label,
  variant = "primary",
  size = "md",
  icon,
  loading = false,
  fullWidth = false,
  disabled,
  ...rest
}: ButtonProps) {
  const { colors } = useTheme();
  const look = LOOKS[variant];
  const inactive = disabled || loading;
  const slop = Math.max(0, (MIN_TOUCH - HEIGHT[size]) / 2);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy: loading }}
      disabled={inactive}
      hitSlop={slop}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: HEIGHT[size],
          paddingHorizontal: size === "sm" ? space[3] : space[4],
          backgroundColor: pressed ? colors[look.pressed] : look.bg ? colors[look.bg] : "transparent",
          borderColor: look.border ? colors[look.border] : "transparent",
          opacity: inactive && !loading ? 0.5 : 1,
          alignSelf: fullWidth ? "stretch" : "flex-start",
        },
      ]}
      {...rest}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator size="small" color={colors[look.fg]} />
        ) : icon ? (
          <Icon icon={icon} size={size === "sm" ? 16 : 18} color={look.fg} />
        ) : null}
        <Text
          variant={size === "sm" ? "callout" : "headline"}
          weight="semibold"
          style={{ color: colors[look.fg] }}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.button, borderWidth: 1, justifyContent: "center" },
  content: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space[2] },
});
