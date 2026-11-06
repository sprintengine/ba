"use client";

import { useFormContext, useWatch } from "react-hook-form";
import { formatDuration } from "@/lib/format";
import type { ServiceFormValues as V } from "@/lib/services/service-form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { NumberInput } from "@/components/ui/number-input";
import { ServiceReleaseNote } from "../../releases/service-release-note";
import { useVocabulary } from "@/lib/vocabulary";
import { SettingFieldRow, SettingFormRow } from "../../settings/settings-common";
import { Section } from "./section";

const INTERVALS = [5, 10, 15, 20, 30, 45, 60, 90, 120];
const NOTICE = [
  { value: 0, label: "No notice needed" },
  { value: 30, label: "30 minutes" },
  { value: 60, label: "1 hour" },
  { value: 120, label: "2 hours" },
  { value: 240, label: "4 hours" },
  { value: 720, label: "12 hours" },
  { value: 1440, label: "1 day" },
  { value: 2880, label: "2 days" },
  { value: 10080, label: "1 week" },
];

function Minutes({
  name,
  label,
  help,
  min = 0,
  required,
}: {
  name: "durationMinutes" | "bufferBeforeMinutes" | "bufferAfterMinutes";
  label: string;
  help?: string;
  min?: number;
  required?: boolean;
}) {
  return (
    <SettingFormRow<V, typeof name> name={name} label={label} help={help} required={required}>
      {(field) => (
        <NumberInput
          mode="decimal"
          value={field.value}
          onValueChange={(n) => field.onChange(n ?? 0)}
          min={min}
          unit="min"
        />
      )}
    </SettingFormRow>
  );
}

/** `serviceId`: the service being edited (null for a new one), to show the release schedules covering it. */
export function TimingSection({ serviceId = null }: { serviceId?: string | null }) {
  const { v } = useVocabulary();
  const form = useFormContext<V>();
  const capacity = useWatch({ control: form.control, name: "capacity" });
  return (
    <Section
      title="Timing"
      description={`Buffers block time for setup or cleaning without showing it to the ${v("customer")}.`}
      rows
    >
      <Minutes name="durationMinutes" label="Duration" min={5} required />
      <Minutes name="bufferBeforeMinutes" label="Buffer before" />
      <Minutes name="bufferAfterMinutes" label="Buffer after" />
      <SettingFormRow<V, "slotIntervalMinutes">
        name="slotIntervalMinutes"
        label="Start times every"
        help="How often a slot can start."
      >
        {(field) => (
          <Select
            value={field.value === null ? "auto" : String(field.value)}
            onValueChange={(val) => field.onChange(val === "auto" ? null : Number(val))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Same as duration</SelectItem>
              {INTERVALS.map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {formatDuration(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </SettingFormRow>
      <SettingFormRow<V, "minNoticeMinutes">
        name="minNoticeMinutes"
        label="Minimum notice"
        help="How late people can book online."
      >
        {(field) => (
          <Select
            value={field.value === null ? "default" : String(field.value)}
            onValueChange={(val) => field.onChange(val === "default" ? null : Number(val))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Business default</SelectItem>
              {NOTICE.map((n) => (
                <SelectItem key={n.value} value={String(n.value)}>
                  {n.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </SettingFormRow>
      <SettingFormRow<V, "maxAdvanceDays">
        name="maxAdvanceDays"
        label="Book up to"
        help="How many days ahead people can book. Leave empty to use the business default."
      >
        {(field) => (
          <NumberInput
            mode="decimal"
            value={field.value}
            onValueChange={field.onChange}
            min={1}
            placeholder="Default"
            unit="days"
          />
        )}
      </SettingFormRow>
      <ServiceReleaseNote serviceId={serviceId} />
      <SettingFieldRow
        fit
        label="Group session"
        help="Several people book the same time (a class, a tour). Each takes one seat."
      >
        <Switch
          checked={capacity > 1}
          onCheckedChange={(c) => form.setValue("capacity", c ? 8 : 1, { shouldDirty: true })}
        />
      </SettingFieldRow>
      {capacity > 1 && (
        <SettingFormRow<V, "capacity"> name="capacity" label="Seats per session">
          {(field) => (
            <NumberInput
              mode="decimal"
              value={field.value}
              // At least 2 while typing too: emptying the field or typing the "1" of "12" must not end the group
              // session (capacity 1), which would hide this field mid-edit. Blurring clamps the text to 2 as well.
              onValueChange={(n) => field.onChange(Math.max(n ?? 2, 2))}
              min={2}
            />
          )}
        </SettingFormRow>
      )}
    </Section>
  );
}
