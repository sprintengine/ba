import { StyleSheet, View } from "react-native";
import { Switch } from "~/ui";

export type RowToggleProps = {
  /** The visible word ("Public"). */
  label: string;
  /** Whose setting it is ("Initial assessment"): the switch is announced as "Public: Initial assessment". */
  name: string;
  hint: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  testID?: string;
};

/**
 * A list row's switch with a short visible label and a full accessible name (the website's `aria-label="Public:
 * <name>"`), so a screen reader can tell one row's switch from the next. `~/ui` Switch names itself with its visible
 * label; this wraps it in one accessible element that carries the longer name and toggles on activate.
 */
export function RowToggle({ label, name, hint, value, onChange, disabled, testID }: RowToggleProps) {
  return (
    <View
      style={styles.root}
      accessible
      accessibilityRole="switch"
      accessibilityLabel={`${label}: ${name}`}
      accessibilityHint={hint}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      accessibilityActions={[{ name: "activate" }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === "activate" && !disabled) onChange(!value);
      }}
      testID={testID ? `${testID}-toggle` : undefined}
    >
      <Switch label={label} value={value} onValueChange={onChange} disabled={disabled} testID={testID} />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
