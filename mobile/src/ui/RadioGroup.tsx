import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "./Text";
import { useTheme } from "./theme";
import { borderWidth, MIN_TOUCH, radius, space } from "./tokens";

export type RadioOption<T extends string> = { value: T; label: string; description?: string };

export type RadioGroupProps<T extends string> = {
  /** The question the choices answer ("Role"); a visible label and the group's accessible name. */
  label: string;
  /** Hide the visible label (the screen's heading already says it); it stays the group's accessible name. */
  hideLabel?: boolean;
  value: T | null;
  options: RadioOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  error?: string | null;
  testID?: string;
};

/**
 * One of a few choices, each with a sentence explaining it (the website's RadioCards): a role, who can use AI agents.
 * Every option is one accessible radio button with its description as the hint.
 */
export function RadioGroup<T extends string>({
  label,
  hideLabel,
  value,
  options,
  onChange,
  disabled,
  error,
  testID,
}: RadioGroupProps<T>) {
  const { colors } = useTheme();
  return (
    <View style={styles.root} accessibilityRole="radiogroup" accessibilityLabel={label} testID={testID}>
      {hideLabel ? null : (
        <Text variant="callout" weight="medium">
          {label}
        </Text>
      )}
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            testID={testID ? `${testID}-${option.value}` : undefined}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityHint={option.description}
            accessibilityState={{ checked: selected, disabled: !!disabled }}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.option,
              {
                backgroundColor: selected ? colors.brandSoft : pressed ? colors.muted : colors.surface,
                borderColor: selected ? colors.brand : colors.border,
                borderWidth: selected ? borderWidth.focus : borderWidth.hairline,
                opacity: disabled ? 0.6 : 1,
              },
            ]}
          >
            <View
              style={[styles.dot, { borderColor: selected ? colors.brand : colors.borderStrong }]}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              {selected ? <View style={[styles.inner, { backgroundColor: colors.brand }]} /> : null}
            </View>
            <View style={styles.text}>
              <Text weight="medium">{option.label}</Text>
              {option.description ? (
                <Text variant="callout" tone="muted">
                  {option.description}
                </Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}
      {error ? (
        <Text variant="footnote" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const DOT = space[5];

const styles = StyleSheet.create({
  root: { gap: space[2] },
  option: {
    minHeight: MIN_TOUCH,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space[3],
    borderRadius: radius.lg,
    paddingHorizontal: space[3],
    paddingVertical: space[3],
  },
  dot: {
    width: DOT,
    height: DOT,
    marginTop: space[0.5],
    borderRadius: radius.full,
    borderWidth: borderWidth.focus,
    alignItems: "center",
    justifyContent: "center",
  },
  inner: { width: space[2.5], height: space[2.5], borderRadius: radius.full },
  text: { flex: 1, gap: space[0.5] },
});
