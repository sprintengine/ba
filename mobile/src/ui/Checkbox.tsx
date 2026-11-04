import { Pressable, StyleSheet, View } from "react-native";
import { Check } from "lucide-react-native";
import { Icon } from "./Icon";
import { Text } from "./Text";
import { useTheme } from "./theme";
import { borderWidth, MIN_TOUCH, radius, space } from "./tokens";

export type CheckboxProps = {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: string;
  disabled?: boolean;
  testID?: string;
};

/** A labelled checkbox; the whole row toggles it. */
export function Checkbox({ label, checked, onChange, description, disabled, testID }: CheckboxProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityHint={description}
      accessibilityState={{ checked, disabled: !!disabled }}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      style={[styles.row, { opacity: disabled ? 0.5 : 1 }]}
    >
      <View
        style={[
          styles.box,
          {
            backgroundColor: checked ? colors.brand : colors.surface,
            borderColor: checked ? colors.brand : colors.borderStrong,
          },
        ]}
      >
        {checked ? <Icon icon={Check} size={16} color="brandForeground" strokeWidth={2.5} /> : null}
      </View>
      <View style={styles.text}>
        <Text weight="medium">{label}</Text>
        {description ? (
          <Text variant="callout" tone="muted">
            {description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: MIN_TOUCH, flexDirection: "row", alignItems: "center", gap: space[3] },
  box: {
    width: space[6],
    height: space[6],
    borderRadius: radius.xs,
    borderWidth: borderWidth.focus,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { flex: 1, gap: space[0.5] },
});
