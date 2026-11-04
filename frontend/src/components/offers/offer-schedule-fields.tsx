"use client";

import { useController, useFieldArray, useFormContext, useFormState, useWatch } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { todayInTz } from "@/lib/format";
import { WEEKDAYS } from "@/lib/offers/display";
import {
  LAST_MINUTE_MAX_HOURS,
  MAX_REDEMPTIONS,
  MAX_TIME_WINDOWS,
  type OfferFormValues,
} from "@/lib/offers/offer-form";
import { useVocabulary } from "@/lib/vocabulary";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { FormField } from "@/components/ui/form";
import { IconButton } from "@/components/ui/icon-button";
import { Switch } from "@/components/ui/switch";
import { TimeInput } from "@/components/ui/time-input";
import { NumberInput } from "@/components/ui/number-input";
import { FieldGroup, FormSection, TogglePill } from "./offer-form-parts";

type V = OfferFormValues;

const PRESETS = [
  { label: "Weekdays", days: [1, 2, 3, 4, 5] },
  { label: "Weekends", days: [6, 7] },
] as const;

export function ScheduleFields() {
  return (
    <FormSection
      title="When it applies"
      description="A time gets the deal when every condition you set matches."
    >
      <DaysField />
      <TimeWindowsField />
      <LastMinuteField />
    </FormSection>
  );
}

function DaysField() {
  const { field, fieldState } = useController<V, "schedule.daysOfWeek">({ name: "schedule.daysOfWeek" });
  const days = field.value;
  const set = (next: number[]) => field.onChange([...new Set(next)].sort((a, b) => a - b));
  const same = (a: readonly number[]) => a.length === days.length && a.every((d) => days.includes(d));
  return (
    <FieldGroup
      legend="Days"
      help={days.length === 0 ? "No days picked: every day." : undefined}
      error={fieldState.error?.message}
    >
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Days of the week">
        {WEEKDAYS.map((d) => (
          <TogglePill
            key={d.value}
            label={d.long}
            pressed={days.includes(d.value)}
            onPressedChange={(on) => set(on ? [...days, d.value] : days.filter((x) => x !== d.value))}
          >
            {d.short}
          </TogglePill>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        {PRESETS.map((p) => (
          <Button
            key={p.label}
            size="xs"
            variant="ghost"
            aria-pressed={same(p.days)}
            onClick={() => set([...p.days])}
          >
            {p.label}
          </Button>
        ))}
        <Button size="xs" variant="ghost" aria-pressed={days.length === 0} onClick={() => set([])}>
          Every day
        </Button>
      </div>
    </FieldGroup>
  );
}

function TimeWindowsField() {
  const form = useFormContext<V>();
  const { fields, append, remove } = useFieldArray<V, "schedule.timeWindows">({
    name: "schedule.timeWindows",
  });
  const { errors } = useFormState<V>({ name: "schedule.timeWindows" });
  const listError = errors.schedule?.timeWindows?.root?.message ?? errors.schedule?.timeWindows?.message;
  const full = fields.length >= MAX_TIME_WINDOWS;
  const addWindow = () => {
    const last = form.getValues("schedule.timeWindows").at(-1);
    append(
      last?.end && last.end < "20:00" ? { start: last.end, end: null } : { start: "13:00", end: "17:00" },
    );
  };
  return (
    <FieldGroup
      legend="Hours"
      help={
        fields.length === 0
          ? "No hours set: all day. Times match when they start inside a window."
          : "Times match when they start inside a window."
      }
      error={listError}
      action={
        <Button size="xs" variant="secondary" disabled={full} onClick={addWindow}>
          <Plus /> Add hours
        </Button>
      }
    >
      {fields.length > 0 && (
        <ul className="flex flex-col gap-2">
          {fields.map((f, i) => (
            <li key={f.id} className="flex flex-wrap items-start gap-2">
              <FormField<V, `schedule.timeWindows.${number}.start`> name={`schedule.timeWindows.${i}.start`}>
                {(field) => (
                  <TimeInput
                    value={field.value}
                    onValueChange={field.onChange}
                    onBlur={field.onBlur}
                    aria-label={`Window ${i + 1} from`}
                  />
                )}
              </FormField>
              <span className="mt-2 text-sm text-muted-foreground" aria-hidden>
                to
              </span>
              <FormField<V, `schedule.timeWindows.${number}.end`> name={`schedule.timeWindows.${i}.end`}>
                {(field) => (
                  <TimeInput
                    value={field.value}
                    onValueChange={field.onChange}
                    onBlur={field.onBlur}
                    aria-label={`Window ${i + 1} to`}
                    placeholder="17:00"
                  />
                )}
              </FormField>
              <IconButton label={`Remove window ${i + 1}`} size="md" onClick={() => remove(i)}>
                <Trash2 />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </FieldGroup>
  );
}

function LastMinuteField() {
  const lastMinute = useWatch<V, "lastMinute">({ name: "lastMinute" });
  return (
    <div className="flex flex-col gap-3">
      <FormField<V, "lastMinute">
        name="lastMinute"
        orientation="horizontal"
        label="Last-minute only"
        help="Only applies to times starting soon, to fill gaps that would otherwise go empty."
      >
        {(field) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
      </FormField>
      {lastMinute && (
        <FormField<V, "schedule.lastMinuteHours">
          name="schedule.lastMinuteHours"
          label="Starting within"
          className="sm:w-48"
        >
          {(field) => (
            <NumberInput
              mode="decimal"
              value={field.value}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
              min={1}
              max={LAST_MINUTE_MAX_HOURS}
              unit="hours"
            />
          )}
        </FormField>
      )}
    </div>
  );
}

export function LimitsFields() {
  const business = useCurrentBusiness();
  const { v } = useVocabulary();
  const validFrom = useWatch<V, "validFrom">({ name: "validFrom" });
  const today = todayInTz(business.timezone);
  return (
    <FormSection title="Dates and limits">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField<V, "validFrom"> name="validFrom" label="Starts" optional>
          {(field) => (
            <DateWithClear
              value={field.value}
              onChange={field.onChange}
              placeholder="Straight away"
              timeZone={business.timezone}
              label="start date"
            />
          )}
        </FormField>
        <FormField<V, "validUntil"> name="validUntil" label="Ends" optional>
          {(field) => (
            <DateWithClear
              value={field.value}
              onChange={field.onChange}
              placeholder="No end date"
              timeZone={business.timezone}
              min={validFrom && validFrom > today ? validFrom : today}
              label="end date"
            />
          )}
        </FormField>
      </div>
      <FormField<V, "maxRedemptions">
        name="maxRedemptions"
        label="Limit"
        optional
        help={`The deal stops after this many ${v("bookings")}.`}
        className="sm:w-60"
      >
        {(field) => (
          <NumberInput
            mode="decimal"
            value={field.value}
            onValueChange={field.onChange}
            onBlur={field.onBlur}
            min={1}
            max={MAX_REDEMPTIONS}
            placeholder="Unlimited"
            unit={v("bookings")}
          />
        )}
      </FormField>
      <FormField<V, "active">
        name="active"
        orientation="horizontal"
        label="Active"
        help="Paused deals are kept but not applied to new bookings."
      >
        {(field) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
      </FormField>
    </FormSection>
  );
}

function DateWithClear({
  value,
  onChange,
  placeholder,
  timeZone,
  min,
  label,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder: string;
  timeZone: string;
  min?: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <DatePicker
        value={value}
        onValueChange={onChange}
        placeholder={placeholder}
        timeZone={timeZone}
        min={min}
        className="min-w-0 flex-1"
      />
      {value && (
        <Button size="sm" variant="ghost" aria-label={`Clear ${label}`} onClick={() => onChange(null)}>
          Clear
        </Button>
      )}
    </div>
  );
}
