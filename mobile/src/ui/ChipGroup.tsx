import { Pressable, StyleSheet, View } from "react-native";
import { Check } from "lucide-react-native";
import { Icon } from "./Icon";
import { Text } from "./Text";
import { useTheme } from "./theme";
import { borderWidth, MIN_TOUCH, radius, space } from "./tokens";

export type Chip<T extends string> = {
  value: T;
  /** What the chip shows ("Mon"). */
  label: string;
  /** What a screen reader says, when the label is abbreviated ("Monday"). */
  accessibilityLabel?: string;
};

export type ChipGroupProps<T extends string> = {
  label: string;
  hideLabel?: boolean;
  chips: Chip<T>[];
  /** The chips that are on. */
  value: readonly T[];
  onChange: (value: T[]) => void;
  /** Help under the chips ("None picked: every day"). */
  hint?: string;
  error?: string | null;
  disabled?: boolean;
  testID?: string;
};

/**
 * Several on/off choices shown as wrapping chips: days of the week, the services a deal covers, the groups a service
 * is for. Each chip is a checkbox to assistive tech; the order of `value` follows `chips`.
 */
export function ChipGroup<T extends string>({
  label,
  hideLabel,
  chips,
  value,
  onChange,
  hint,
  error,
  disabled,
  testID,
}: ChipGroupProps<T>) {
  const { colors } = useTheme();
  const on = new Set(value);
  const toggle = (chip: T) => {
    const next = new Set(on);
    if (next.has(chip)) next.delete(chip);
    else next.add(chip);
    onChange(chips.map((c) => c.value).filter((c) => next.has(c)));
  };
  const help = error ?? hint;
  return (
    <View style={styles.root} testID={testID}>
      {hideLabel ? null : (
        <Text variant="callout" weight="medium">
          {label}
        </Text>
      )}
      <View style={styles.chips} accessibilityLabel={label}>
        {chips.map((chip) => {
          const selected = on.has(chip.value);
          return (
            <Pressable
              key={chip.value}
              testID={testID ? `${testID}-${chip.value}` : undefined}
              accessibilityRole="checkbox"
              accessibilityLabel={chip.accessibilityLabel ?? chip.label}
              accessibilityState={{ checked: selected, disabled: !!disabled }}
              disabled={disabled}
              onPress={() => toggle(chip.value)}
              hitSlop={space[1]}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: selected ? colors.brandSoft : pressed ? colors.muted : colors.surface,
                  borderColor: selected ? colors.brand : colors.borderStrong,
                  borderWidth: selected ? borderWidth.focus : borderWidth.hairline,
                  opacity: disabled ? 0.6 : 1,
                },
              ]}
            >
              {selected ? (
                <Icon icon={Check} size={14} color="brandSoftForeground" strokeWidth={2.5} />
              ) : null}
              <Text
                variant="callout"
                weight={selected ? "semibold" : "medium"}
                style={{ color: selected ? colors.brandSoftForeground : colors.foreground }}
              >
                {chip.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {help ? (
        <Text
          variant="footnote"
          tone={error ? "danger" : "subtle"}
          accessibilityLiveRegion={error ? "polite" : "none"}
        >
          {help}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space[1.5] },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  chip: {
    minHeight: MIN_TOUCH - space[2],
    flexDirection: "row",
    alignItems: "center",
    gap: space[1],
    borderRadius: radius.full,
    paddingHorizontal: space[3],
  },
});
