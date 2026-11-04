import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type PressableProps } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { Icon, type IconComponent } from "./Icon";
import { Text } from "./Text";
import { useTheme } from "./theme";
import { MIN_TOUCH, space } from "./tokens";

export type ListRowProps = {
  title: string;
  subtitle?: string;
  icon?: IconComponent;
  /** Anything before the text (an avatar); replaces `icon`. */
  leading?: ReactNode;
  /** Short text or an element at the end (a count, a badge, a switch). */
  trailing?: ReactNode;
  onPress?: PressableProps["onPress"];
  /** Shows the disclosure chevron; defaults to whether the row navigates (`onPress`). */
  chevron?: boolean;
  /** Highlighted (the open item of a split view). */
  selected?: boolean;
  destructive?: boolean;
  accessibilityHint?: string;
  testID?: string;
};

/** A settings / navigation row: 44pt minimum, one accessible element with the title and subtitle as its label. */
export function ListRow({
  title,
  subtitle,
  icon,
  leading,
  trailing,
  onPress,
  chevron = !!onPress,
  selected,
  destructive,
  accessibilityHint,
  testID,
}: ListRowProps) {
  const { colors } = useTheme();
  const content = (
    <>
      {leading ?? (icon ? <Icon icon={icon} color={destructive ? "danger" : "mutedForeground"} /> : null)}
      <View style={styles.text}>
        <Text variant="body" weight="medium" tone={destructive ? "danger" : "default"} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="callout" tone="muted" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {typeof trailing === "string" ? (
        <Text variant="callout" tone="muted" numeric>
          {trailing}
        </Text>
      ) : (
        trailing
      )}
      {chevron ? <Icon icon={ChevronRight} size={18} color="subtleForeground" /> : null}
    </>
  );
  if (!onPress) {
    return (
      <View style={styles.row} testID={testID}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? colors.muted : selected ? colors.brandSoft : "transparent" },
      ]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: MIN_TOUCH + space[2],
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[2.5],
  },
  text: { flex: 1, gap: space[0.5] },
});
