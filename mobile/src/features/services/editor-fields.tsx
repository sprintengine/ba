/** Small form pieces the service editor needs that the shared form kit (`~/ui/form`) doesn't have. */
import type { ReactNode } from "react";
import {
  useController,
  useFormState,
  type Control,
  type FieldPath,
  type FieldValues,
  type PathValue,
} from "react-hook-form";
import { StyleSheet, View } from "react-native";
import { Text, useLayout, useTheme, Select, type SelectOption } from "~/ui";
import { radius, space } from "~/ui/tokens";
import { fromChoice, toChoice } from "./editor";

/** A nullable number picked from a list (`null` is the "none" choice): "Start times every", "Minimum notice". */
export function FormChoiceField<T extends FieldValues, N extends FieldPath<T>>({
  control,
  name,
  label,
  options,
  testID,
}: {
  control: Control<T>;
  name: N;
  label: string;
  options: (value: number | null) => SelectOption<string>[];
  testID?: string;
}) {
  const {
    field: { value, onChange },
    fieldState,
  } = useController({ control, name });
  const current = value as number | null;
  return (
    <Select<string>
      label={label}
      value={toChoice(current)}
      options={options(current)}
      onChange={(choice) => onChange(fromChoice(choice) as PathValue<T, N>)}
      error={fieldState.error?.message}
      testID={testID}
    />
  );
}

/** A field's error on its own (for controls that don't show one: a switch). Announced when it appears. */
export function FieldError<T extends FieldValues>({
  control,
  name,
}: {
  control: Control<T>;
  name: FieldPath<T>;
}) {
  const { errors } = useFormState({ control, name });
  const message = name
    .split(".")
    .reduce<unknown>((at, key) => (at as Record<string, unknown> | undefined)?.[key], errors) as
    { message?: string } | undefined;
  if (!message?.message) return null;
  return (
    <Text variant="footnote" tone="danger" accessibilityLiveRegion="polite">
      {message.message}
    </Text>
  );
}

/** Fields side by side on a wide window, stacked on a phone. */
export function FieldRow({ children }: { children: ReactNode }) {
  const { isWide } = useLayout();
  return (
    <View style={isWide ? styles.row : styles.column}>
      {(Array.isArray(children) ? children : [children]).map((child, i) =>
        child ? (
          <View key={i} style={isWide ? styles.cell : null}>
            {child}
          </View>
        ) : null,
      )}
    </View>
  );
}

/** One option / add-on / requirement: a bordered group under its heading ("Option 2"). */
export function ItemCard({ children, testID }: { children: ReactNode; testID?: string }) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.item, { borderColor: colors.border, backgroundColor: colors.surfaceRaised }]}
      testID={testID}
    >
      {children}
    </View>
  );
}

/** An item's heading line: its name and its remove button. */
export function ItemHeader({ title, action }: { title: string; action: ReactNode }) {
  return (
    <View style={styles.itemHeader}>
      <Text variant="headline" accessibilityRole="header" style={styles.itemTitle}>
        {title}
      </Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: space[3] },
  column: { gap: space[4] },
  cell: { flex: 1 },
  item: {
    gap: space[3],
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.xl,
    padding: space[3],
  },
  itemHeader: { flexDirection: "row", alignItems: "center", gap: space[2] },
  itemTitle: { flex: 1 },
});
