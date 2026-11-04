import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "./Text";
import { useTheme } from "./theme";
import { MIN_TOUCH, radius, space } from "./tokens";

export type Segment<T extends string> = {
  value: T;
  label: string;
  /** A count after the label. */ count?: number;
};

export type SegmentedControlProps<T extends string> = {
  segments: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  /** What the segments switch between, for screen readers ("Bookings"). */
  accessibilityLabel: string;
};

/** Switches between views of one screen (Upcoming / Past). A tab list to assistive tech. */
export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  accessibilityLabel,
}: SegmentedControlProps<T>) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={[styles.track, { backgroundColor: colors.muted }]}
    >
      {segments.map((segment) => {
        const selected = segment.value === value;
        const label = segment.count === undefined ? segment.label : `${segment.label} ${segment.count}`;
        return (
          <Pressable
            key={segment.value}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected }}
            onPress={() => onChange(segment.value)}
            style={[styles.segment, selected ? { backgroundColor: colors.surface } : null]}
          >
            <Text
              variant="callout"
              weight={selected ? "semibold" : "medium"}
              tone={selected ? "default" : "muted"}
            >
              {segment.label}
              {segment.count === undefined ? "" : `  ${segment.count}`}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: "row", borderRadius: radius.lg, padding: space[1], gap: space[1] },
  segment: {
    flex: 1,
    minHeight: MIN_TOUCH - space[1],
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space[3],
  },
});
