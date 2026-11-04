import { Switch as RNSwitch, StyleSheet, View } from "react-native";
import { Text } from "./Text";
import { useTheme } from "./theme";
import { MIN_TOUCH, space } from "./tokens";

export type SwitchProps = {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  testID?: string;
};

/** A labelled on/off setting; the row's text is the switch's accessible name. */
export function Switch({ label, description, value, onValueChange, disabled, testID }: SwitchProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <View style={styles.text} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Text weight="medium">{label}</Text>
        {description ? (
          <Text variant="callout" tone="muted">
            {description}
          </Text>
        ) : null}
      </View>
      <RNSwitch
        testID={testID}
        accessibilityLabel={label}
        accessibilityHint={description}
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ true: colors.brand, false: colors.borderStrong }}
        ios_backgroundColor={colors.borderStrong}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: MIN_TOUCH, flexDirection: "row", alignItems: "center", gap: space[3] },
  text: { flex: 1, gap: space[0.5] },
});
