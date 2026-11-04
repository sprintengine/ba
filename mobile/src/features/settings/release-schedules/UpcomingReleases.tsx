import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Check, Clock, Pause, Undo2, Zap } from "lucide-react-native";
import type { ReleaseChangeInput, ReleaseDay, ReleaseSchedule, ReleaseScope } from "@shared/api/types";
import { useChangeRelease, useReleases, useResetRelease } from "@shared/api/hooks/use-releases";
import { useBusinessContext } from "@shared/business/business-context";
import { addDaysToPlainDate, DEFAULT_LOCALE, formatDate, todayInTz } from "@shared/format";
import { useNow } from "@shared/hooks/use-now";
import { sameRelease } from "@shared/releases/calendar";
import { opensLabel, RELEASE_STATE } from "@shared/releases/text";
import {
  Badge,
  Button,
  Checkbox,
  DateField,
  Divider,
  ErrorState,
  Icon,
  SegmentedControl,
  Section,
  Sheet,
  Skeleton,
  Text,
  TimeField,
} from "~/ui";
import { useSaveFeedback } from "~/ui/form";
import { space } from "~/ui/tokens";
import { changeNote, moveStart, moveTarget, timesLabel, UPCOMING_DAYS, upcomingDays } from "./releases";

/** One schedule's release of one day, and what's needed to change it (the website's ReleaseTarget). */
export type ReleaseTarget = {
  scheduleId: string;
  scheduleName: string;
  day: ReleaseDay;
  /** The schedule opens other days at the same moment (a week, a weekend): a change covers them unless "just this day". */
  multiDay: boolean;
};

/** Open now, move, hold or reset one release, with a toast and haptic for each; each resolves whether it worked. */
export function useReleaseControls(target: ReleaseTarget) {
  const { business } = useBusinessContext();
  const change = useChangeRelease(business.id);
  const reset = useResetRelease(business.id);
  const feedback = useSaveFeedback();
  const { scheduleId, day } = target;
  const run = (input: ReleaseChangeInput, done: string) =>
    feedback.run(() => change.mutateAsync({ scheduleId, date: day.date, input }), done);
  return {
    pending: change.isPending || reset.isPending,
    openNow: (scope: ReleaseScope = "release") => run({ action: "open_now", scope }, "Opened for booking"),
    hold: (scope: ReleaseScope = "release") => run({ action: "hold", scope }, "On hold until you open it"),
    move: (opensAt: string, scope: ReleaseScope = "release") =>
      run({ action: "move", opensAt, scope }, "Release time changed"),
    reset: (scope: ReleaseScope = "release") =>
      feedback.run(() => reset.mutateAsync({ scheduleId, date: day.date, scope }), "Back on schedule"),
  };
}

/**
 * The next fortnight's releases of the active schedules (one schedule at a time), each with its one-off changes:
 * open now, change the time, hold, or back on schedule. Like changing one meeting in a recurring series.
 */
export function UpcomingReleases({ schedules }: { schedules: ReleaseSchedule[] }) {
  const { business } = useBusinessContext();
  const now = useNow(30_000);
  const today = todayInTz(business.timezone, now);
  const range = { from: today, to: addDaysToPlainDate(today, UPCOMING_DAYS - 1) };
  const releases = useReleases(business.id, schedules.length > 0 ? range : null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [changing, setChanging] = useState<ReleaseTarget | null>(null);
  if (schedules.length === 0) return null;
  const scheduleId = chosen && schedules.some((s) => s.id === chosen) ? chosen : (schedules[0]?.id ?? "");
  const schedule = schedules.find((s) => s.id === scheduleId);
  const days = releases.data?.schedules.find((r) => r.scheduleId === scheduleId)?.days ?? [];
  const rows = upcomingDays(days, now);
  const target = (day: ReleaseDay): ReleaseTarget => ({
    scheduleId,
    scheduleName: schedule?.name ?? "",
    day,
    multiDay: schedule ? sameRelease(schedule, day.date).length > 1 : false,
  });

  return (
    <Section
      title="Upcoming releases"
      description="Change one release without changing its schedule, like one meeting in a recurring series."
      testID="release-upcoming"
    >
      {schedules.length > 1 ? (
        <SegmentedControl
          accessibilityLabel="Schedule"
          value={scheduleId}
          onChange={setChosen}
          segments={schedules.map((s) => ({ value: s.id, label: s.name }))}
        />
      ) : null}
      {releases.isError && !releases.data ? (
        <ErrorState error={releases.error} onRetry={() => void releases.refetch()} />
      ) : !releases.data ? (
        <View accessible accessibilityRole="progressbar" accessibilityLabel="Loading the releases">
          <Skeleton height={96} radius="lg" />
        </View>
      ) : rows.length === 0 ? (
        <Text variant="callout" tone="muted">
          Nothing to release in the next {UPCOMING_DAYS} days: every day with free times is already open.
        </Text>
      ) : (
        <View>
          {rows.map((day, i) => (
            <View key={day.date}>
              {i > 0 ? <Divider /> : null}
              <UpcomingRow target={target(day)} onChange={setChanging} />
            </View>
          ))}
        </View>
      )}
      {changing ? (
        <ChangeTimeSheet key={changing.day.date} target={changing} onClose={() => setChanging(null)} />
      ) : null}
    </Section>
  );
}

function UpcomingRow({
  target,
  onChange,
}: {
  target: ReleaseTarget;
  onChange: (target: ReleaseTarget) => void;
}) {
  const { business } = useBusinessContext();
  const locale = business.locale || DEFAULT_LOCALE;
  const now = useNow();
  const controls = useReleaseControls(target);
  const { day } = target;
  const state = RELEASE_STATE[day.state];
  const note = changeNote(day, opensLabel(day.scheduledAt, business.timezone, locale, now));
  const date = formatDate(day.date, business.timezone, "dayMonth", locale);
  const opens =
    day.opensAt === null
      ? "Opens when you open it"
      : `${day.state === "open" ? "Opened" : "Opens"} ${opensLabel(day.opensAt, business.timezone, locale, now)}`;
  const label = [`${date}, ${timesLabel(day.times)}`, opens, note, state.label].filter(Boolean).join(". ");
  return (
    <View style={styles.row} testID={`release-row-${day.date}`}>
      <View style={styles.summary} accessible accessibilityLabel={label}>
        <View style={styles.head}>
          <View style={styles.when}>
            <Text weight="medium">{date}</Text>
            <Text variant="footnote" tone="muted" numeric>
              {timesLabel(day.times)}
            </Text>
          </View>
          <Badge label={state.label} tone={state.tone} />
        </View>
        <View style={styles.opens}>
          <Icon
            icon={day.state === "held" ? Pause : Clock}
            size={14}
            color={day.state === "held" ? "danger" : "mutedForeground"}
          />
          <Text variant="callout" style={styles.flex}>
            {opens}
          </Text>
        </View>
        {note ? (
          <Text variant="footnote" tone="muted">
            {note}
          </Text>
        ) : null}
      </View>
      <View style={styles.actions}>
        {day.state !== "open" ? (
          <Button
            size="sm"
            variant="secondary"
            icon={Zap}
            label="Open now"
            testID={`release-open-${day.date}`}
            disabled={controls.pending}
            onPress={() => void controls.openNow()}
          />
        ) : null}
        {day.state !== "open" ? (
          <Button
            size="sm"
            variant="ghost"
            icon={Clock}
            label="Change"
            testID={`release-change-${day.date}`}
            onPress={() => onChange(target)}
          />
        ) : null}
        {day.changed ? (
          <Button
            size="sm"
            variant="ghost"
            icon={Undo2}
            label="Reset"
            testID={`release-reset-${day.date}`}
            disabled={controls.pending}
            onPress={() => void controls.reset()}
          />
        ) : (
          <Button
            size="sm"
            variant="ghost"
            icon={Pause}
            label="Hold"
            testID={`release-hold-${day.date}`}
            disabled={controls.pending}
            onPress={() => void controls.hold()}
          />
        )}
      </View>
    </View>
  );
}

/**
 * "When should it open?": the release's own day and time (it must open before the day ends) and, for a release that
 * opens several days at once, "Just this day". The website's ChangeTimePopover.
 */
function ChangeTimeSheet({ target, onClose }: { target: ReleaseTarget; onClose: () => void }) {
  const { business } = useBusinessContext();
  const tz = business.timezone;
  const controls = useReleaseControls(target);
  const start = moveStart(target.day, tz);
  const [scope, setScope] = useState<ReleaseScope>("release");
  const [date, setDate] = useState(start.date);
  const [time, setTime] = useState(start.time);
  const { opensAt, error } = moveTarget(target.day, date, time, tz);
  const save = async () => {
    if (await controls.move(opensAt, scope)) onClose();
  };
  return (
    <Sheet
      visible
      onClose={onClose}
      title="When should it open?"
      testID="release-change-sheet"
      footer={
        <Button
          label="Save time"
          icon={Check}
          fullWidth
          testID="release-change-save"
          disabled={!!error}
          loading={controls.pending}
          onPress={() => void save()}
        />
      }
    >
      <Text tone="muted">
        {target.scheduleName} · {formatDate(target.day.date, tz, "long", business.locale || DEFAULT_LOCALE)}
      </Text>
      {target.multiDay ? (
        <Checkbox
          label="Just this day"
          description="Otherwise the change covers every day this release opens."
          checked={scope === "day"}
          onChange={(on) => setScope(on ? "day" : "release")}
          testID="release-change-day-only"
        />
      ) : null}
      <DateField
        label="Day"
        value={date}
        onChange={(d) => d && setDate(d)}
        min={todayInTz(tz)}
        max={target.day.date}
        locale={business.locale || DEFAULT_LOCALE}
        testID="release-change-date"
      />
      <TimeField label="Time" value={time} onChange={setTime} error={error} testID="release-change-time" />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: space[3], gap: space[2] },
  summary: { gap: space[1] },
  head: { flexDirection: "row", alignItems: "flex-start", gap: space[3] },
  when: { flex: 1 },
  opens: { flexDirection: "row", alignItems: "center", gap: space[1.5] },
  flex: { flex: 1 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
});
