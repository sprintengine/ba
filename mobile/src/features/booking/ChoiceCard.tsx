import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Check, Plus } from "lucide-react-native";
import { Icon, type IconComponent, Text, useTheme } from "~/ui";
import { borderWidth, MIN_TOUCH, radius, space } from "~/ui/tokens";

/**
 * A choice as a card (the website's RadioCard / add-on checkbox): `radio` for one of several (a group, an option, a
 * therapist), `checkbox` for any number (add-ons). One accessible element: its title, aside and description.
 */
export function ChoiceCard({
  kind = "radio",
  selected,
  onPress,
  title,
  description,
  aside,
  icon,
  leading,
  testID,
  accessibilityLabel,
}: {
  kind?: "radio" | "checkbox";
  selected: boolean;
  onPress: () => void;
  title: string;
  description?: string | null;
  /** A price at the end. */
  aside?: string | null;
  icon?: IconComponent;
  /** Replaces `icon` (an avatar). */
  leading?: ReactNode;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole={kind}
      accessibilityState={{ checked: selected }}
      accessibilityLabel={accessibilityLabel ?? [title, aside, description].filter(Boolean).join(", ")}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: pressed ? colors.muted : colors.surface,
          borderColor: selected ? colors.primary : colors.border,
          borderWidth: selected ? borderWidth.focus : borderWidth.hairline,
        },
      ]}
    >
      {kind === "checkbox" ? (
        <View
          style={[
            styles.box,
            {
              backgroundColor: selected ? colors.primary : "transparent",
              borderColor: selected ? colors.primary : colors.input,
            },
          ]}
        >
          <Icon
            icon={selected ? Check : Plus}
            size={14}
            color={selected ? "primaryForeground" : "mutedForeground"}
          />
        </View>
      ) : (
        (leading ??
        (icon ? (
          <View style={[styles.icon, { backgroundColor: colors.brandSoft }]}>
            <Icon icon={icon} size={18} color="brandSoftForeground" />
          </View>
        ) : null))
      )}
      <View style={styles.text}>
        <View style={styles.titleRow}>
          <Text variant="body" weight="semibold" style={styles.flex}>
            {title}
          </Text>
          {aside ? (
            <Text variant="body" weight="medium" numeric>
              {aside}
            </Text>
          ) : null}
        </View>
        {description ? (
          <Text variant="callout" tone="muted">
            {description}
          </Text>
        ) : null}
      </View>
      {kind === "radio" ? (
        <View
          style={[
            styles.radio,
            {
              borderColor: selected ? colors.primary : colors.input,
              backgroundColor: selected ? colors.primary : "transparent",
            },
          ]}
        >
          {selected ? (
            <View style={[styles.radioDot, { backgroundColor: colors.primaryForeground }]} />
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: MIN_TOUCH + space[4],
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    borderRadius: radius.xl,
    padding: space[4],
  },
  icon: {
    width: space[10],
    height: space[10],
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  box: {
    width: space[6],
    height: space[6],
    borderRadius: radius.xs,
    borderWidth: borderWidth.focus,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { flex: 1, gap: space[0.5] },
  titleRow: { flexDirection: "row", gap: space[3], alignItems: "flex-start" },
  flex: { flex: 1 },
  radio: {
    width: space[5],
    height: space[5],
    borderRadius: radius.full,
    borderWidth: borderWidth.focus,
    alignItems: "center",
    justifyContent: "center",
  },
  radioDot: { width: space[2], height: space[2], borderRadius: radius.full },
});
