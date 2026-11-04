import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { Copy, Plus, Users, X } from "lucide-react-native";
import type { CustomerGroup, DayOfWeek } from "@shared/api/types";
import { nextRange, validateDay, type TimeRange } from "@shared/availability/weekly-hours";
import { Button, IconButton, Switch, Text, TimeField } from "~/ui";
import { hapticSelection } from "~/ui/form";
import { space } from "~/ui/tokens";

export type DayRowProps = {
  day: DayOfWeek;
  /** "Monday". */
  label: string;
  ranges: TimeRange[];
  /** Active customer groups: when there are any, each range says who can book it. */
  groups: readonly CustomerGroup[];
  editable: boolean;
  onChange: (day: DayOfWeek, ranges: TimeRange[]) => void;
  /** Opens the copy-to-other-days choices. */
  onCopy: (day: DayOfWeek) => void;
  /** Opens the audience picker for the range at `index`. */
  onAudience: (day: DayOfWeek, index: number) => void;
};

/** The testID stem of a day: `hours-monday`. */
export const dayTestID = (label: string) => `hours-${label.toLowerCase()}`;

/** Who can book a range: "Everyone" or the chosen groups' names. */
export function audienceText(groups: readonly CustomerGroup[], ids: readonly string[]): string {
  if (ids.length === 0) return "Everyone";
  return groups
    .filter((g) => ids.includes(g.id))
    .map((g) => g.name)
    .join(", ");
}

/**
 * One weekday (the website's DayRow): open or closed, its time ranges with who can book them, add a range, copy to
 * other days. Times use the platform's time picker.
 */
export const DayRow = memo(function DayRow({
  day,
  label,
  ranges,
  groups,
  editable,
  onChange,
  onCopy,
  onAudience,
}: DayRowProps) {
  const errors = validateDay(ranges);
  const open = ranges.length > 0;
  const id = dayTestID(label);
  const set = (next: TimeRange[]) => onChange(day, next);
  const patch = (i: number, p: Partial<TimeRange>) =>
    set(ranges.map((x, j) => (j === i ? { ...x, ...p } : x)));

  return (
    <View style={styles.root} testID={id}>
      <View style={styles.header}>
        <View style={styles.day}>
          <Switch
            testID={`${id}-open`}
            label={label}
            description={open ? undefined : "Closed"}
            value={open}
            disabled={!editable}
            onValueChange={(on) => {
              hapticSelection();
              set(on ? [nextRange([])] : []);
            }}
          />
        </View>
        {editable ? (
          <View style={styles.actions}>
            {open ? (
              <IconButton
                icon={Plus}
                size={20}
                accessibilityLabel={`Add hours to ${label}`}
                testID={`${id}-add`}
                onPress={() => set([...ranges, nextRange(ranges)])}
              />
            ) : null}
            <IconButton
              icon={Copy}
              size={20}
              accessibilityLabel={`Copy ${label}`}
              testID={`${id}-copy`}
              onPress={() => onCopy(day)}
            />
          </View>
        ) : null}
      </View>
      {ranges.map((r, i) => {
        // Several ranges on a day: number them so each control has its own name.
        const which = ranges.length > 1 ? ` (${i + 1})` : "";
        const error = errors[i];
        const span = `${label} ${r.startTime}–${r.endTime}`;
        const who = audienceText(groups, r.audienceGroupIds);
        return (
          <View key={i} style={styles.range} testID={`${id}-${i}`}>
            <View style={styles.times}>
              <View style={styles.time}>
                <TimeField
                  label={`Start${which}`}
                  testID={`${id}-${i}-start`}
                  value={r.startTime}
                  disabled={!editable}
                  onChange={(t) => patch(i, { startTime: t })}
                />
              </View>
              <View style={styles.time}>
                <TimeField
                  label={`End${which}`}
                  testID={`${id}-${i}-end`}
                  value={r.endTime}
                  disabled={!editable}
                  onChange={(t) => patch(i, { endTime: t })}
                />
              </View>
            </View>
            {groups.length > 0 || editable ? (
              <View style={styles.rangeActions}>
                {groups.length > 0 ? (
                  <Button
                    testID={`${id}-${i}-audience`}
                    size="sm"
                    variant={r.audienceGroupIds.length ? "secondary" : "ghost"}
                    icon={Users}
                    label={who}
                    accessibilityLabel={`Who can book ${span}: ${who}`}
                    disabled={!editable}
                    onPress={() => onAudience(day, i)}
                  />
                ) : (
                  <View />
                )}
                {editable ? (
                  <IconButton
                    icon={X}
                    size={20}
                    color="mutedForeground"
                    accessibilityLabel={`Remove ${span}`}
                    testID={`${id}-${i}-remove`}
                    onPress={() => set(ranges.filter((_, j) => j !== i))}
                  />
                ) : null}
              </View>
            ) : null}
            {error ? (
              <Text
                variant="footnote"
                tone="danger"
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                testID={`${id}-${i}-error`}
              >
                {error}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  root: { paddingHorizontal: space[4], paddingVertical: space[3], gap: space[2] },
  header: { flexDirection: "row", alignItems: "center", gap: space[3] },
  day: { flex: 1 },
  actions: { flexDirection: "row", alignItems: "center" },
  range: { gap: space[1] },
  times: { flexDirection: "row", flexWrap: "wrap", columnGap: space[4] },
  time: { flexGrow: 1, flexBasis: 140 },
  rangeActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space[2],
  },
});
