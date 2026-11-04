import { Pressable, StyleSheet, View, type PressableProps } from "react-native";
import { Icon, type IconComponent } from "./Icon";
import { Text } from "./Text";
import { useTheme } from "./theme";
import { MIN_TOUCH, radius, space, type ThemeColors } from "./tokens";

export type IconButtonProps = Omit<PressableProps, "children" | "style"> & {
  icon: IconComponent;
  /** Required: what the button does, for screen readers ("Notifications", "Close"). */
  accessibilityLabel: string;
  color?: keyof ThemeColors;
  /** A count badge (unread notifications); hidden when 0. */
  badge?: number;
  size?: number;
};

/** An icon-only button with a 44pt target. */
export function IconButton({
  icon,
  accessibilityLabel,
  color = "foreground",
  badge,
  size = 22,
  ...rest
}: IconButtonProps) {
  const { colors } = useTheme();
  const label = badge ? `${accessibilityLabel}, ${badge} new` : accessibilityLabel;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.base, { backgroundColor: pressed ? colors.muted : "transparent" }]}
      {...rest}
    >
      <Icon icon={icon} size={size} color={color} />
      {badge ? (
        <View style={[styles.badge, { backgroundColor: colors.danger }]}>
          <Text variant="caption" style={{ color: colors.dangerForeground }} numeric>
            {badge > 99 ? "99+" : badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: 4,
    right: 2,
    minWidth: 18,
    paddingHorizontal: space[1],
    borderRadius: radius.full,
    alignItems: "center",
  },
});
