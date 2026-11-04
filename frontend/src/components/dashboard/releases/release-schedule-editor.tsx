"use client";

import { useController, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Lock, Sparkles } from "lucide-react";
import type { CustomerGroup, ReleaseSchedule, Service } from "@/lib/api/types";
import { useCreateReleaseSchedule, useUpdateReleaseSchedule } from "@/lib/api/hooks";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { formatDate, todayInTz } from "@/lib/format/datetime";
import { DEFAULT_LOCALE } from "@/lib/format/locale";
import { useNow } from "@/lib/hooks/use-now";
import { previewDays } from "@/lib/releases/calendar";
import {
  defaultScheduleForm,
  formToInput,
  MAX_DAYS_BEFORE,
  MAX_WEEKS_AHEAD,
  scheduleFormSchema,
  scheduleToForm,
  type ScheduleFormValues,
} from "@/lib/releases/schedule-form";
import {
  daysBeforeLabel,
  opensLabel,
  scheduleSummary,
  weekAheadLabel,
  weekdayName,
} from "@/lib/releases/text";
import { cn } from "@/lib/utils";
import { useVocabulary } from "@/lib/vocabulary";
import { FieldGroup, FormSection } from "@/components/offers/offer-form-parts";
import { Badge } from "@/components/ui/badge";
import { CheckboxItem } from "@/components/ui/checkbox";
import { applyApiErrors, FormField, FormRootError } from "@/components/ui/form";
import { FormSheet } from "@/components/ui/form-dialog";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { TimeInput } from "@/components/ui/time-input";
import { toast } from "@/components/ui/toast";

type V = ScheduleFormValues;

/** Days the preview shows. */
const PREVIEW_DAYS = 8;

/** Create or edit a release schedule: a side sheet with the form and, beside it, when the coming days would open. */
export function ReleaseScheduleEditor({
  schedule,
  services,
  groups,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  schedule: ReleaseSchedule | null;
  /** The services a schedule can cover (the business's active public services). */
  services: Service[];
  /** The business's active customer groups. */
  groups: CustomerGroup[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo?: HTMLElement | null;
}) {
  const business = useCurrentBusiness();
  const create = useCreateReleaseSchedule(business.id);
  const update = useUpdateReleaseSchedule(business.id);
  const form = useForm<V>({
    resolver: zodResolver(scheduleFormSchema),
    defaultValues: schedule ? scheduleToForm(schedule) : defaultScheduleForm(),
  });

  const submit = async (values: V) => {
    const input = formToInput(values);
    try {
      if (schedule) {
        await update.mutateAsync({ id: schedule.id, input });
        toast.success(`${input.name} saved`);
      } else {
        await create.mutateAsync(input);
        toast.success(`${input.name} created`);
      }
      onOpenChange(false);
    } catch (err) {
      applyApiErrors(form, err);
    }
  };

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      returnFocusTo={returnFocusTo}
      form={form}
      onSubmit={submit}
      size="xl"
      className="sm:max-w-4xl"
      title={schedule ? `Edit ${schedule.name}` : "New release schedule"}
      description="Days stay closed to online booking until they're released. Your team can always book them."
      submitLabel={schedule ? "Save changes" : "Create schedule"}
    >
      <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_20rem] lg:overflow-hidden">
        <div className="flex flex-col gap-9 px-5 py-6 lg:overflow-y-auto">
          <FormSection title="Basics">
            <FormField<V, "name">
              name="name"
              label="Name"
              required
              help="Only your team sees it, e.g. “Medical card next-day”."
            >
              {(field) => (
                <Input {...field} autoComplete="off" maxLength={80} placeholder="e.g. Next-day release" />
              )}
            </FormField>
            <FormField<V, "active">
              name="active"
              orientation="horizontal"
              label="Active"
              help="A paused schedule keeps nothing closed."
            >
              {(field) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
            </FormField>
          </FormSection>
          <ServicesField services={services} />
          <AudienceField groups={groups} />
          <TimingFields />
          <FormRootError />
        </div>
        <aside className="border-t border-border-subtle bg-surface-sunken/60 px-5 py-6 lg:overflow-y-auto lg:border-t-0 lg:border-l">
          <Preview isNew={!schedule || schedule.status === "paused"} />
        </aside>
      </div>
    </FormSheet>
  );
}

function ServicesField({ services }: { services: Service[] }) {
  const { field, fieldState } = useController<V, "serviceIds">({ name: "serviceIds" });
  const selected = field.value;
  const toggle = (id: string, on: boolean) =>
    field.onChange(on ? [...selected.filter((x) => x !== id), id] : selected.filter((x) => x !== id));
  return (
    <FormSection title="Services" description="The days of these services open on this schedule.">
      <FieldGroup legend="Applies to" error={fieldState.error?.message}>
        {services.length === 0 ? (
          <p className="text-sm text-subtle-foreground">Add a service to your booking page first.</p>
        ) : (
          <div className="grid gap-2.5 rounded-xl border border-border p-3 sm:grid-cols-2">
            {services.map((s) => (
              <CheckboxItem
                key={s.id}
                id={`release-service-${s.id}`}
                label={s.name}
                checked={selected.includes(s.id)}
                onCheckedChange={(c) => toggle(s.id, c === true)}
                onBlur={field.onBlur}
              />
            ))}
          </div>
        )}
      </FieldGroup>
    </FormSection>
  );
}

function AudienceField({ groups }: { groups: CustomerGroup[] }) {
  const { v } = useVocabulary();
  const everyone = useController<V, "everyone">({ name: "everyone" });
  const ids = useController<V, "groupIds">({ name: "groupIds" });
  if (groups.length === 0) return null;
  const toggle = (id: string, on: boolean) =>
    ids.field.onChange(
      on ? [...ids.field.value.filter((x) => x !== id), id] : ids.field.value.filter((x) => x !== id),
    );
  return (
    <FormSection
      title="For whom"
      description={`Everyone, or only some ${v("customer")} groups (the others book as usual).`}
    >
      <SegmentedControl
        aria-label="For whom"
        className="self-start"
        value={everyone.field.value ? "everyone" : "groups"}
        onValueChange={(value) => everyone.field.onChange(value === "everyone")}
        options={[
          { value: "everyone", label: "Everyone" },
          { value: "groups", label: "Some groups" },
        ]}
      />
      {!everyone.field.value && (
        <FieldGroup
          legend="Groups"
          error={ids.fieldState.error?.message}
          help={`${v("customers", { title: true })} booking without a group follow schedules for unrestricted groups too.`}
        >
          <div className="grid gap-2.5 rounded-xl border border-border p-3 sm:grid-cols-2">
            {groups.map((g) => (
              <CheckboxItem
                key={g.id}
                id={`release-group-${g.id}`}
                label={
                  <span className="flex items-center gap-2">
                    {g.name}
                    {g.restricted && (
                      <Badge tone="warning" className="h-5">
                        <Lock /> Restricted
                      </Badge>
                    )}
                  </span>
                }
                checked={ids.field.value.includes(g.id)}
                onCheckedChange={(c) => toggle(g.id, c === true)}
                onBlur={ids.field.onBlur}
              />
            ))}
          </div>
        </FieldGroup>
      )}
    </FormSection>
  );
}

const DAYS_BEFORE = Array.from({ length: MAX_DAYS_BEFORE + 1 }, (_, i) => i);
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];
const WEEKS_AHEAD = Array.from({ length: MAX_WEEKS_AHEAD }, (_, i) => i + 1);

function TimingFields() {
  const business = useCurrentBusiness();
  const locale = business.locale || DEFAULT_LOCALE;
  const cadence = useWatch<V, "cadence">({ name: "cadence" });
  const cadenceField = useController<V, "cadence">({ name: "cadence" });
  return (
    <FormSection title="When days open" description="In your timezone; the preview shows the coming days.">
      <SegmentedControl
        aria-label="How days open"
        className="self-start"
        value={cadence}
        onValueChange={cadenceField.field.onChange}
        options={[
          { value: "daily", label: "Day by day" },
          { value: "weekly", label: "Week by week" },
        ]}
      />
      {cadence === "daily" ? (
        <>
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField<V, "daysBefore"> name="daysBefore" label="Each day opens">
              {(field) => (
                <Select value={String(field.value)} onValueChange={(x) => field.onChange(Number(x))}>
                  <SelectTrigger ref={field.ref}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS_BEFORE.map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {daysBeforeLabel(d)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <TimeField />
          </div>
          <FormField<V, "weekdaysOnly">
            name="weekdaysOnly"
            orientation="horizontal"
            label="Skip weekends"
            help="Releases that would fall on a Saturday or Sunday happen on the Friday before (Monday opens on Friday)."
          >
            {(field) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
          </FormField>
        </>
      ) : (
        <div className="grid gap-5 sm:grid-cols-3">
          <FormField<V, "weekday"> name="weekday" label="Every">
            {(field) => (
              <Select value={String(field.value)} onValueChange={(x) => field.onChange(Number(x))}>
                <SelectTrigger ref={field.ref}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEEKDAYS.map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {weekdayName(d, locale)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <TimeField />
          <FormField<V, "weeksAhead"> name="weeksAhead" label="Opens">
            {(field) => (
              <Select value={String(field.value)} onValueChange={(x) => field.onChange(Number(x))}>
                <SelectTrigger ref={field.ref}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEEKS_AHEAD.map((w) => (
                    <SelectItem key={w} value={String(w)}>
                      {weekAheadLabel(w)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
        </div>
      )}
    </FormSection>
  );
}

function TimeField() {
  return (
    <FormField<V, "time"> name="time" label="At">
      {(field) => (
        <TimeInput
          ref={field.ref}
          value={field.value}
          onValueChange={field.onChange}
          onBlur={field.onBlur}
          className="w-full"
        />
      )}
    </FormField>
  );
}

/** When the next days would open with the form as it is, and the sentence the schedule list will show. */
function Preview({ isNew }: { isNew: boolean }) {
  const business = useCurrentBusiness();
  const { v } = useVocabulary();
  const locale = business.locale || DEFAULT_LOCALE;
  const now = useNow();
  const values = useWatch<V>() as V;
  const timing = formToInput(values);
  const valid = !!values.time && /^([01]\d|2[0-3]):[0-5]\d$/.test(values.time);
  const today = todayInTz(business.timezone, now);
  const days = valid ? previewDays(timing, today, PREVIEW_DAYS, business.timezone, now) : [];
  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        <Sparkles className="size-3.5" /> What {v("customers")} will see
      </p>
      {valid ? (
        <>
          <p className="text-sm">{scheduleSummary(timing, locale)}</p>
          <ul className="flex flex-col divide-y divide-border-subtle rounded-xl border border-border bg-surface text-sm">
            {days.map((d) => (
              <li key={d.date} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="font-medium whitespace-nowrap">
                  {formatDate(d.date, business.timezone, "dayMonth", locale)}
                </span>
                <span
                  className={cn(
                    "flex items-center gap-1 text-right text-xs",
                    d.open ? "text-success" : "text-muted-foreground",
                  )}
                >
                  {d.open ? <Check className="size-3.5" /> : <Lock className="size-3.5" />}
                  {d.open ? "Open" : `Opens ${opensLabel(d.opensAt, business.timezone, locale, now)}`}
                </span>
              </li>
            ))}
          </ul>
          {values.active && (
            <p className="text-xs text-muted-foreground">
              {isNew
                ? "Saving closes the days that haven't opened yet straight away. Bookings already made are kept."
                : "Days that are already open stay open when you change the time."}
            </p>
          )}
          {business.policies.maxAdvanceDays < 7 * ((timing.weeksAhead ?? 0) + 1) &&
            timing.cadence === "weekly" && (
              <p className="text-xs text-warning-soft-foreground">
                Your policies only let people book {business.policies.maxAdvanceDays} days ahead, so the end
                of each released week stays closed until then.
              </p>
            )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Enter a release time to see when days open.</p>
      )}
    </div>
  );
}
