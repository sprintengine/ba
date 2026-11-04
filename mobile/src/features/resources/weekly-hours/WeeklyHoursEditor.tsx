import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { CalendarRange, Trash2 } from "lucide-react-native";
import type { DayOfWeek } from "@shared/api/types";
import { useCustomerGroups } from "@shared/api/hooks/use-business";
import { useReplaceResourceRules } from "@shared/api/hooks/use-resources";
import {
  addPeriod,
  copyDay,
  removeSchedule,
  scheduleFor,
  schedulesError,
  schedulesToRules,
  updateSchedule,
  validatePeriod,
  validateWeek,
  weeklyMinutes,
  WEEKDAYS,
  type Schedule,
  type Schedules,
  type TimeRange,
} from "@shared/availability/weekly-hours";
import { useBusinessContext } from "@shared/business/business-context";
import { formatDuration } from "@shared/format";
import { Button, Card, DateField, Divider, Select, Text, useTheme } from "~/ui";
import { useSaveFeedback, useUnsavedChangesGuard } from "~/ui/form";
import { radius, space } from "~/ui/tokens";
import { scheduleLabel } from "../resources";
import { AddPeriodSheet } from "./AddPeriodSheet";
import { AudienceSheet } from "./AudienceSheet";
import { CopySheet } from "./CopySheet";
import { DayRow } from "./DayRow";

const dayLabel = (day: DayOfWeek) => WEEKDAYS.find((d) => d.day === day)?.long ?? "";

/**
 * The weekly-hours editor (the website's WeeklyHoursEditor): regular and seasonal schedules, a row per weekday, save
 * and discard. Unsaved hours ask before the screen (or the split view's selection) goes.
 */
export function WeeklyHoursEditor({
  resourceId,
  initial,
  editable,
}: {
  resourceId: string;
  initial: Schedules;
  editable: boolean;
}) {
  const { business } = useBusinessContext();
  const { colors } = useTheme();
  const groups = useCustomerGroups(business.id);
  const save = useReplaceResourceRules(business.id, resourceId);
  const feedback = useSaveFeedback();
  const [schedules, setSchedules] = useState<Schedules>(initial);
  const [activeKey, setActiveKey] = useState(initial[0].key);
  const [adding, setAdding] = useState(false);
  const [copying, setCopying] = useState<DayOfWeek | null>(null);
  const [audience, setAudience] = useState<{ day: DayOfWeek; index: number } | null>(null);
  const active = scheduleFor(schedules, activeKey);
  const dirty = JSON.stringify(schedulesToRules(schedules)) !== JSON.stringify(schedulesToRules(initial));
  const tooMany = schedulesError(schedules);
  const valid = !tooMany && schedules.every((s) => validateWeek(s.days) && !validatePeriod(s));
  const activeGroups = (groups.data ?? []).filter((g) => g.isActive);
  useUnsavedChangesGuard(editable && dirty);

  const update = (patch: Partial<Omit<Schedule, "key">>) =>
    setSchedules((all) => updateSchedule(all, active.key, patch));
  const setDay = (day: DayOfWeek, ranges: TimeRange[]) =>
    setSchedules((all) =>
      updateSchedule(all, active.key, { days: { ...scheduleFor(all, active.key).days, [day]: ranges } }),
    );

  const submit = async () => {
    await feedback.run(() => save.mutateAsync(schedulesToRules(schedules)), "Hours saved");
  };

  const audienceRange = audience ? active.days[audience.day][audience.index] : undefined;
  const dated = active.validFrom !== null || active.validUntil !== null;

  return (
    <View style={styles.root} testID="weekly-hours">
      <View style={styles.toolbar}>
        {schedules.length > 1 ? (
          <View style={styles.which}>
            <Select
              label="Which hours"
              testID="hours-which"
              value={active.key}
              options={schedules.map((s) => ({
                value: s.key,
                label: scheduleLabel(s, business.timezone, business.locale),
              }))}
              onChange={setActiveKey}
            />
          </View>
        ) : (
          <Text weight="semibold">Regular hours</Text>
        )}
        <Text variant="footnote" tone="muted" numeric testID="hours-total">
          {formatDuration(weeklyMinutes(active.days))} a week
        </Text>
        {editable ? (
          <View style={styles.seasonal}>
            <Button
              testID="hours-seasonal"
              size="sm"
              variant="ghost"
              icon={CalendarRange}
              label="Seasonal hours"
              onPress={() => setAdding(true)}
            />
          </View>
        ) : null}
      </View>

      {dated ? (
        <View
          style={[styles.period, { backgroundColor: colors.surfaceSunken, borderColor: colors.border }]}
          testID="hours-period"
        >
          <DateField
            label="From"
            testID="hours-period-from"
            value={active.validFrom}
            onChange={(d) => update({ validFrom: d })}
            clearable
            disabled={!editable}
            locale={business.locale}
          />
          <DateField
            label="Until"
            testID="hours-period-until"
            value={active.validUntil}
            onChange={(d) => update({ validUntil: d })}
            clearable
            min={active.validFrom}
            disabled={!editable}
            error={validatePeriod(active)}
            locale={business.locale}
          />
          <Text variant="footnote" tone="muted">
            These hours apply on dates in this period, in addition to your regular hours.
          </Text>
          {editable ? (
            <View style={styles.start}>
              <Button
                testID="hours-period-remove"
                size="sm"
                variant="ghost"
                icon={Trash2}
                label="Remove these hours"
                onPress={() => {
                  setSchedules((all) => removeSchedule(all, active.key));
                  setActiveKey(schedules[0].key);
                }}
              />
            </View>
          ) : null}
        </View>
      ) : null}

      <Card padding={0}>
        {WEEKDAYS.map(({ day, long }, i) => (
          <View key={day}>
            {i > 0 ? <Divider inset={space[4]} /> : null}
            <DayRow
              day={day}
              label={long}
              ranges={active.days[day]}
              groups={activeGroups}
              editable={editable}
              onChange={setDay}
              onCopy={setCopying}
              onAudience={(d, index) => setAudience({ day: d, index })}
            />
          </View>
        ))}
      </Card>

      {editable ? (
        <View style={styles.footer}>
          {tooMany ? (
            <Text variant="footnote" tone="danger" style={styles.status} accessibilityLiveRegion="polite">
              {tooMany}
            </Text>
          ) : dirty ? (
            <Text variant="footnote" tone="muted" style={styles.status} testID="hours-unsaved">
              Unsaved changes
            </Text>
          ) : (
            <View style={styles.status} />
          )}
          <Button
            testID="hours-discard"
            variant="ghost"
            label="Discard"
            disabled={!dirty || save.isPending}
            onPress={() => setSchedules(initial)}
          />
          <Button
            testID="hours-save"
            label="Save hours"
            disabled={!dirty || !valid}
            loading={save.isPending}
            onPress={() => void submit()}
          />
        </View>
      ) : null}

      {editable ? (
        <>
          <AddPeriodSheet
            visible={adding}
            onClose={() => setAdding(false)}
            onAdd={(from, until) => {
              const added = addPeriod(schedules, from, until);
              setSchedules(added.schedules);
              setActiveKey(added.key);
            }}
          />
          <CopySheet
            visible={copying !== null}
            label={copying ? dayLabel(copying) : ""}
            onClose={() => setCopying(null)}
            onCopy={(targets) => {
              if (copying) update({ days: copyDay(active.days, copying, targets) });
            }}
          />
          <AudienceSheet
            visible={!!audience && !!audienceRange}
            label={
              audience && audienceRange
                ? `${dayLabel(audience.day)} ${audienceRange.startTime}–${audienceRange.endTime}`
                : ""
            }
            groups={activeGroups}
            value={audienceRange?.audienceGroupIds ?? []}
            onClose={() => setAudience(null)}
            onChange={(ids) => {
              if (!audience) return;
              const ranges = active.days[audience.day];
              setDay(
                audience.day,
                ranges.map((r, j) => (j === audience.index ? { ...r, audienceGroupIds: ids } : r)),
              );
            }}
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space[4] },
  toolbar: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: space[3],
    rowGap: space[2],
  },
  which: { flexBasis: "100%" },
  seasonal: { marginLeft: "auto" },
  period: {
    gap: space[2],
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space[3],
  },
  start: { alignItems: "flex-start" },
  footer: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: space[2],
  },
  status: { flexGrow: 1, flexShrink: 1 },
});
