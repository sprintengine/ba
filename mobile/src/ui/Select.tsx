import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Check, ChevronDown } from "lucide-react-native";
import { Icon } from "./Icon";
import { ListRow } from "./ListRow";
import { Sheet } from "./Sheet";
import { Text } from "./Text";
import { useTheme } from "./theme";
import { borderWidth, MIN_TOUCH, radius, space } from "./tokens";

export type SelectOption<T extends string> = { value: T; label: string; description?: string };

export type SelectProps<T extends string> = {
  label: string;
  value: T | null;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  error?: string | null;
  testID?: string;
};

/** A labelled field that opens a sheet of options (native pickers can't show descriptions or scale well). */
export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  placeholder = "Choose…",
  error,
  testID,
}: SelectProps<T>) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <View style={styles.root}>
      <Text variant="callout" weight="medium">
        {label}
      </Text>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current?.label ?? placeholder}`}
        accessibilityHint="Opens the options"
        onPress={() => setOpen(true)}
        style={[
          styles.field,
          {
            backgroundColor: colors.surface,
            borderColor: error ? colors.danger : colors.input,
            borderWidth: error ? borderWidth.focus : borderWidth.hairline,
          },
        ]}
      >
        <Text style={styles.value} tone={current ? "default" : "subtle"} numberOfLines={1}>
          {current?.label ?? placeholder}
        </Text>
        <Icon icon={ChevronDown} size={18} color="mutedForeground" />
      </Pressable>
      {error ? (
        <Text variant="footnote" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <Sheet visible={open} onClose={() => setOpen(false)} title={label}>
        {options.map((option) => (
          <ListRow
            key={option.value}
            title={option.label}
            subtitle={option.description}
            selected={option.value === value}
            chevron={false}
            trailing={option.value === value ? <Icon icon={Check} color="brand" /> : undefined}
            onPress={() => {
              onChange(option.value);
              setOpen(false);
            }}
          />
        ))}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space[1.5] },
  field: {
    minHeight: MIN_TOUCH + space[1],
    borderRadius: radius.lg,
    paddingHorizontal: space[3],
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
  },
  value: { flex: 1 },
});
