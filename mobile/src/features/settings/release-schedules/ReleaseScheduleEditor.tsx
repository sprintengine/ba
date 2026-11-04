import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { useController, useForm, useWatch, type Control } from "react-hook-form";
import { StyleSheet, View } from "react-native";
import { Check, Lock, Sparkles, Trash2 } from "lucide-react-native";
import type { CustomerGroup, ReleaseSchedule, Service } from "@shared/api/types";
import {
  useCreateReleaseSchedule,
  useDeleteReleaseSchedule,
  useUpdateReleaseSchedule,
} from "@shared/api/hooks/use-releases";
import { useBusinessContext } from "@shared/business/business-context";
import { DEFAULT_LOCALE, formatDate, todayInTz } from "@shared/format";
import { useNow } from "@shared/hooks/use-now";
import { previewDays } from "@shared/releases/calendar";
import {
  defaultScheduleForm,
  formToInput,
  MAX_DAYS_BEFORE,
  MAX_WEEKS_AHEAD,
  scheduleFormSchema,
  scheduleToForm,
  type ScheduleFormValues as V,
} from "@shared/releases/schedule-form";
import {
  daysBeforeLabel,
  opensLabel,
  scheduleSummary,
  weekAheadLabel,
  weekdayName,
} from "@shared/releases/text";
import { useVocabulary } from "@shared/vocabulary";
import { Button, Card, Divider, Icon, SegmentedControl, Select, Sheet, Text } from "~/ui";
import {
  applyApiErrors,
  confirmAction,
  confirmDiscard,
  FormChipGroup,
  FormRootError,
  FormSwitch,
  FormTextField,
  FormTimeField,
  useSaveFeedback,
  useUnsavedChangesGuard,
} from "~/ui/form";
import { space } from "~/ui/tokens";
import { PREVIEW_DAYS } from "./releases";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAYS_BEFORE = Array.from({ length: MAX_DAYS_BEFORE + 1 }, (_, i) => i);
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];
const WEEKS_AHEAD = Array.from({ length: MAX_WEEKS_AHEAD }, (_, i) => i + 1);

/**
 * Create or edit a release schedule (the website's ReleaseScheduleEditor): name and status, the services it covers,
 * for whom, when days open, and a live preview of when the coming days would open. Edits also offer deleting it.
 */
export function ReleaseScheduleEditor({
  schedule,
  services,
  groups,
  onClose,
}: {
  schedule: ReleaseSchedule | null;
  /** The services a schedule can cover (the business's active public services). */
  services: Service[];
  /** The business's active customer groups. */
  groups: CustomerGroup[];
  onClose: () => void;
}) {
  const { business } = useBusinessContext();
  const create = useCreateReleaseSchedule(business.id);
  const update = useUpdateReleaseSchedule(business.id);
  const remove = useDeleteReleaseSchedule(business.id);
  const feedback = useSaveFeedback();
  const form = useForm<V>({
    resolver: zodResolver(scheduleFormSchema),
    defaultValues: schedule ? scheduleToForm(schedule) : defaultScheduleForm(),
  });
  const { isDirty, isSubmitting } = form.formState;
  const { leave } = useUnsavedChangesGuard(isDirty);

  const close = async () => {
    if (isDirty && !(await confirmDiscard())) return;
    onClose();
  };

  const submit = form.handleSubmit(async (values) => {
    const input = formToInput(values);
    try {
      if (schedule) {
        await update.mutateAsync({ id: schedule.id, input });
        feedback.saved(`${input.name} saved`);
      } else {
        await create.mutateAsync(input);
        feedback.saved(`${input.name} created`);
      }
      leave(onClose);
    } catch (err) {
      applyApiErrors(form, err);
    }
  });

  const deleteSchedule = async () => {
    if (!schedule) return;
    const ok = await confirmAction({
      title: `Delete ${schedule.name}?`,
      message: "Its days open to online booking straight away, as far ahead as your policies allow.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    if (await feedback.run(() => remove.mutateAsync(schedule.id), "Schedule deleted")) leave(onClose);
  };

  return (
    <Sheet
      visible
      onClose={() => void close()}
      title={schedule ? `Edit ${schedule.name}` : "New release schedule"}
      testID="release-editor"
      footer={
        <Button
          testID="release-editor-save"
          label={schedule ? "Save changes" : "Create schedule"}
          fullWidth
          loading={isSubmitting}
          onPress={() => void submit()}
        />
      }
    >
      <Text tone="muted">
        Days stay closed to online booking until they&apos;re released. Your team can always book them.
      </Text>
      <Part title="Basics">
        <FormTextField
          control={form.control}
          name="name"
          label="Name"
          testID="release-editor-name"
          hint="Only your team sees it, e.g. “Medical card next-day”."
          placeholder="e.g. Next-day release"
          autoComplete="off"
          maxLength={80}
          autoFocus={!schedule}
          returnKeyType="done"
        />
        <FormSwitch
          control={form.control}
          name="active"
          label="Active"
          description="A paused schedule keeps nothing closed."
          testID="release-editor-active"
        />
      </Part>
      <Part title="Services" description="The days of these services open on this schedule.">
        {services.length === 0 ? (
          <Text variant="callout" tone="subtle">
            Add a service to your booking page first.
          </Text>
        ) : (
          <FormChipGroup
            control={form.control}
            name="serviceIds"
            label="Applies to"
            testID="release-editor-services"
            chips={services.map((s) => ({ value: s.id, label: s.name }))}
          />
        )}
      </Part>
      <Audience control={form.control} groups={groups} />
      <Timing control={form.control} />
      <Preview control={form.control} isNew={!schedule || schedule.status === "paused"} />
      <FormRootError control={form.control} />
      {schedule ? (
        <View style={styles.delete}>
          <Button
            testID="release-editor-delete"
            variant="destructive"
            icon={Trash2}
            label="Delete schedule"
            loading={remove.isPending}
            onPress={() => void deleteSchedule()}
          />
        </View>
      ) : null}
    </Sheet>
  );
}

/** A titled part of the editor (the website's FormSection). */
function Part({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.part}>
      <Divider />
      <View style={styles.partHead}>
        <Text variant="headline" accessibilityRole="header">
          {title}
        </Text>
        {description ? (
          <Text variant="callout" tone="muted">
            {description}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function Audience({ control, groups }: { control: Control<V>; groups: CustomerGroup[] }) {
  const { v } = useVocabulary();
  const everyone = useController({ control, name: "everyone" });
  if (groups.length === 0) return null;
  return (
    <Part
      title="For whom"
      description={`Everyone, or only some ${v("customer")} groups (the others book as usual).`}
    >
      <SegmentedControl
        accessibilityLabel="For whom"
        value={everyone.field.value ? "everyone" : "groups"}
        onChange={(value) => everyone.field.onChange(value === "everyone")}
        segments={[
          { value: "everyone", label: "Everyone" },
          { value: "groups", label: "Some groups" },
        ]}
      />
      {everyone.field.value ? null : (
        <FormChipGroup
          control={control}
          name="groupIds"
          label="Groups"
          testID="release-editor-groups"
          hint={`${v("customers", { title: true })} booking without a group follow schedules for unrestricted groups too.`}
          chips={groups.map((g) => ({
            value: g.id,
            label: g.restricted ? `${g.name} · Restricted` : g.name,
            accessibilityLabel: g.restricted ? `${g.name}, restricted` : g.name,
          }))}
        />
      )}
    </Part>
  );
}

function Timing({ control }: { control: Control<V> }) {
  const { business } = useBusinessContext();
  const locale = business.locale || DEFAULT_LOCALE;
  const cadence = useController({ control, name: "cadence" });
  return (
    <Part title="When days open" description="In your timezone; the preview shows the coming days.">
      <SegmentedControl
        accessibilityLabel="How days open"
        value={cadence.field.value}
        onChange={cadence.field.onChange}
        segments={[
          { value: "daily", label: "Day by day" },
          { value: "weekly", label: "Week by week" },
        ]}
      />
      {cadence.field.value === "daily" ? (
        <>
          <NumberSelect
            control={control}
            name="daysBefore"
            label="Each day opens"
            testID="release-editor-days-before"
            options={DAYS_BEFORE.map((d) => ({ value: d, label: daysBeforeLabel(d) }))}
          />
          <FormTimeField control={control} name="time" label="At" testID="release-editor-time" />
          <FormSwitch
            control={control}
            name="weekdaysOnly"
            label="Skip weekends"
            description="Releases that would fall on a Saturday or Sunday happen on the Friday before (Monday opens on Friday)."
            testID="release-editor-weekdays-only"
          />
        </>
      ) : (
        <>
          <NumberSelect
            control={control}
            name="weekday"
            label="Every"
            testID="release-editor-weekday"
            options={WEEKDAYS.map((d) => ({ value: d, label: weekdayName(d, locale) }))}
          />
          <FormTimeField control={control} name="time" label="At" testID="release-editor-time" />
          <NumberSelect
            control={control}
            name="weeksAhead"
            label="Opens"
            testID="release-editor-weeks-ahead"
            options={WEEKS_AHEAD.map((w) => ({ value: w, label: weekAheadLabel(w) }))}
          />
        </>
      )}
    </Part>
  );
}

/** A Select over whole numbers (the form keeps numbers; the picker works in strings). */
function NumberSelect({
  control,
  name,
  label,
  options,
  testID,
}: {
  control: Control<V>;
  name: "daysBefore" | "weekday" | "weeksAhead";
  label: string;
  options: { value: number; label: string }[];
  testID: string;
}) {
  const { field, fieldState } = useController({ control, name });
  return (
    <Select
      label={label}
      testID={testID}
      value={String(field.value)}
      options={options.map((o) => ({ value: String(o.value), label: o.label }))}
      onChange={(value) => field.onChange(Number(value))}
      error={fieldState.error?.message}
    />
  );
}

/** When the next days would open with the form as it is, and the sentence the schedule list will show. */
function Preview({ control, isNew }: { control: Control<V>; isNew: boolean }) {
  const { business } = useBusinessContext();
  const { v } = useVocabulary();
  const locale = business.locale || DEFAULT_LOCALE;
  const now = useNow();
  const values = useWatch({ control }) as V;
  const timing = formToInput(values);
  const valid = !!values.time && TIME_RE.test(values.time);
  const today = todayInTz(business.timezone, now);
  const days = valid ? previewDays(timing, today, PREVIEW_DAYS, business.timezone, now) : [];
  return (
    <View style={styles.part} testID="release-editor-preview">
      <Divider />
      <View style={styles.previewHead}>
        <Icon icon={Sparkles} size={14} color="mutedForeground" />
        <Text variant="caption" tone="muted" accessibilityRole="header">
          {`What ${v("customers")} will see`.toUpperCase()}
        </Text>
      </View>
      {valid ? (
        <>
          <Text testID="release-editor-summary">{scheduleSummary(timing, locale)}</Text>
          <Card padding={0}>
            {days.map((d, i) => {
              const date = formatDate(d.date, business.timezone, "dayMonth", locale);
              const when = d.open ? "Open" : `Opens ${opensLabel(d.opensAt, business.timezone, locale, now)}`;
              return (
                <View key={d.date}>
                  {i > 0 ? <Divider /> : null}
                  <View style={styles.previewRow} accessible accessibilityLabel={`${date}: ${when}`}>
                    <Text variant="callout" weight="medium">
                      {date}
                    </Text>
                    <View style={styles.previewWhen}>
                      <Icon
                        icon={d.open ? Check : Lock}
                        size={14}
                        color={d.open ? "success" : "mutedForeground"}
                      />
                      <Text variant="footnote" tone={d.open ? "success" : "muted"} align="right">
                        {when}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </Card>
          {values.active ? (
            <Text variant="footnote" tone="muted">
              {isNew
                ? "Saving closes the days that haven't opened yet straight away. Bookings already made are kept."
                : "Days that are already open stay open when you change the time."}
            </Text>
          ) : null}
          {timing.cadence === "weekly" &&
          business.policies.maxAdvanceDays < 7 * ((timing.weeksAhead ?? 0) + 1) ? (
            <Text variant="footnote" tone="warning">
              Your policies only let people book {business.policies.maxAdvanceDays} days ahead, so the end of
              each released week stays closed until then.
            </Text>
          ) : null}
        </>
      ) : (
        <Text variant="callout" tone="muted">
          Enter a release time to see when days open.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  part: { gap: space[3], paddingTop: space[2] },
  partHead: { gap: space[1], paddingTop: space[2] },
  previewHead: { flexDirection: "row", alignItems: "center", gap: space[1.5], paddingTop: space[2] },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space[3],
    paddingHorizontal: space[3],
    paddingVertical: space[2],
  },
  previewWhen: { flexDirection: "row", alignItems: "center", gap: space[1], flexShrink: 1 },
  delete: { marginTop: space[4] },
});
