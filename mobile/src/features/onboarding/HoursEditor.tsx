import { StyleSheet, View } from "react-native";
import { Copy, CopyCheck, Plus, X } from "lucide-react-native";
import type { SetupAction } from "@shared/onboarding/actions";
import { DAY_LONG, WEEKDAYS, windowsForDay } from "@shared/onboarding/hours";
import type { SetupErrors, SetupGroup, SetupResource } from "@shared/onboarding/types";
import { Button, IconButton, Switch, Text, TimeField, useTheme } from "~/ui";
import { radius, space } from "~/ui/tokens";

/**
 * A resource's weekly hours (the website's WeeklyHoursEditor): each day open or closed, with one or more opening
 * windows. Copying Monday to the weekdays, or these hours to every other resource, saves typing.
 */
export function HoursEditor({
  resource,
  resourceIndex,
  groups,
  errors,
  otherResourceCount,
  resourcesNoun,
  dispatch,
}: {
  resource: SetupResource;
  resourceIndex: number;
  groups: SetupGroup[];
  errors: SetupErrors;
  otherResourceCount: number;
  resourcesNoun: string;
  dispatch: (action: SetupAction) => void;
}) {
  const { colors } = useTheme();
  const key = resource.key;
  const mondayOpen = windowsForDay(resource.weeklyHours, 1).length > 0;
  const groupName = (k: string) => groups.find((g) => g.key === k)?.name ?? k;
  /** Errors are addressed by the window's index in the (sorted) weekly hours. */
  const errorAt = (window: SetupResource["weeklyHours"][number], field: "startTime" | "endTime") =>
    errors[`resources[${resourceIndex}].weeklyHours[${resource.weeklyHours.indexOf(window)}].${field}`];

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text variant="headline">Weekly hours</Text>
        <View style={styles.copy}>
          <Button
            size="sm"
            variant="ghost"
            icon={Copy}
            label="Copy Monday to weekdays"
            testID="onboarding-hours-copy-monday"
            disabled={!mondayOpen}
            onPress={() => dispatch({ type: "copyDayToWeekdays", resourceKey: key, fromDay: 1 })}
          />
          {otherResourceCount > 0 ? (
            <Button
              size="sm"
              variant="ghost"
              icon={CopyCheck}
              label={`Use for all ${resourcesNoun.toLowerCase()}`}
              testID="onboarding-hours-copy-all"
              onPress={() => dispatch({ type: "copyHoursToAll", resourceKey: key })}
            />
          ) : null}
        </View>
      </View>
      {WEEKDAYS.map((day) => {
        const windows = windowsForDay(resource.weeklyHours, day);
        const open = windows.length > 0;
        return (
          <View
            key={day}
            style={[styles.day, { borderColor: colors.borderSubtle }]}
            testID={`onboarding-hours-day-${day}`}
          >
            <Switch
              label={DAY_LONG[day]}
              description={open ? undefined : "Closed"}
              value={open}
              testID={`onboarding-hours-open-${day}`}
              onValueChange={(value) => dispatch({ type: "setDayOpen", resourceKey: key, day, open: value })}
            />
            {windows.map((w, windowIndex) => (
              <View key={`${w.startTime}-${windowIndex}`} style={styles.window}>
                <View style={styles.times}>
                  <TimeField
                    label={windows.length > 1 ? `Opens (${windowIndex + 1})` : "Opens"}
                    testID={`onboarding-hours-${day}-${windowIndex}-start`}
                    value={w.startTime}
                    error={errorAt(w, "startTime")}
                    onChange={(startTime) =>
                      dispatch({
                        type: "updateWindow",
                        resourceKey: key,
                        day,
                        windowIndex,
                        patch: { startTime },
                      })
                    }
                  />
                  <TimeField
                    label={windows.length > 1 ? `Closes (${windowIndex + 1})` : "Closes"}
                    testID={`onboarding-hours-${day}-${windowIndex}-end`}
                    value={w.endTime}
                    error={errorAt(w, "endTime")}
                    onChange={(endTime) =>
                      dispatch({
                        type: "updateWindow",
                        resourceKey: key,
                        day,
                        windowIndex,
                        patch: { endTime },
                      })
                    }
                  />
                  {w.audienceGroupKeys.length > 0 ? (
                    <Text variant="footnote" tone="muted">
                      Only for {w.audienceGroupKeys.map(groupName).join(", ")}
                    </Text>
                  ) : null}
                </View>
                {windows.length > 1 ? (
                  <IconButton
                    icon={X}
                    size={18}
                    color="mutedForeground"
                    accessibilityLabel={`Remove ${DAY_LONG[day]} ${w.startTime} to ${w.endTime}`}
                    testID={`onboarding-hours-${day}-${windowIndex}-remove`}
                    onPress={() => dispatch({ type: "removeWindow", resourceKey: key, day, windowIndex })}
                  />
                ) : null}
              </View>
            ))}
            {open ? (
              <Button
                size="sm"
                variant="ghost"
                icon={Plus}
                label="Add hours"
                accessibilityLabel={`Add hours on ${DAY_LONG[day]}`}
                testID={`onboarding-hours-add-${day}`}
                onPress={() => dispatch({ type: "addWindow", resourceKey: key, day })}
              />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space[2] },
  header: { gap: space[1] },
  copy: { flexDirection: "row", flexWrap: "wrap", gap: space[1] },
  day: {
    gap: space[2],
    paddingVertical: space[2],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.xs,
  },
  window: { flexDirection: "row", alignItems: "center", gap: space[2] },
  times: { flex: 1, gap: space[2] },
});
