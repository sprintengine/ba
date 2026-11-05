"use client";

import { useMemo } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import type { Service } from "@/lib/api/types";
import { useCurrentBusiness } from "@/lib/business/business-context";
import type { NewBookingValues as Values } from "@/lib/dashboard/new-booking";
import { useVocabulary } from "@/lib/vocabulary";
import { DatePicker } from "@/components/ui/date-picker";
import { FormField } from "@/components/ui/form";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TimeInput } from "@/components/ui/time-input";
import { SlotPicker } from "./slot-picker";

/** The date, who with (when several can do it), and a free time or an exact time. */
export function WhenFields({
  service,
  resources,
  today,
}: {
  service: Service;
  resources: { id: string; name: string; isActive: boolean }[];
  today: string;
}) {
  const business = useCurrentBusiness();
  const { v } = useVocabulary();
  const form = useFormContext<Values>();
  const [optionId, addonIds, date, timeMode, slotStart, withResource] = useWatch({
    control: form.control,
    name: ["optionId", "addonIds", "date", "timeMode", "slotStart", "withResource"],
  });
  const pool = useMemo(() => {
    const ids = new Set(service.requirements.flatMap((r) => r.resourceIds));
    return resources.filter((r) => r.isActive && (ids.size === 0 || ids.has(r.id)));
  }, [service, resources]);
  const withValid = withResource === "any" || pool.some((r) => r.id === withResource);
  const needsOption = service.options.length > 0 && !optionId;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4">
        <FormField<Values, "date"> name="date" label="Date">
          {(field) => (
            <DatePicker
              value={field.value}
              onValueChange={(d) => {
                field.onChange(d);
                form.setValue("slotStart", null);
              }}
              min={today}
              timeZone={business.timezone}
            />
          )}
        </FormField>
        {pool.length > 1 && (
          <FormField<Values, "withResource"> name="withResource" label="With">
            {(field) => (
              <Select
                value={withValid ? field.value : "any"}
                onValueChange={(val) => {
                  field.onChange(val);
                  form.setValue("slotStart", null);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any available {v("resource")}</SelectItem>
                  {pool.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
        )}
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">Start time</span>
        <SegmentedControl
          size="sm"
          aria-label="How to pick the time"
          value={timeMode}
          onValueChange={(m) => form.setValue("timeMode", m)}
          options={[
            { value: "slots", label: "Free times" },
            { value: "exact", label: "Exact time" },
          ]}
        />
      </div>
      {timeMode === "slots" ? (
        needsOption ? (
          <p className="text-sm text-subtle-foreground">Choose an option to see free times.</p>
        ) : (
          <FormField<Values, "slotStart"> name="slotStart">
            {() => (
              <SlotPicker
                serviceId={service.id}
                optionId={optionId}
                addonIds={addonIds}
                resourceId={withValid && withResource !== "any" ? withResource : null}
                date={date}
                onDateChange={(d) => form.setValue("date", d)}
                value={slotStart}
                onChange={(slot) => {
                  form.setValue("slotStart", slot.start, { shouldValidate: true });
                  form.setValue("slotResourceIds", slot.resourceIds);
                  form.setValue("slotOffer", slot.offer ?? null);
                }}
              />
            )}
          </FormField>
        )
      ) : (
        <FormField<Values, "exactTime">
          name="exactTime"
          help="Any time you like. We still check nobody is double-booked."
        >
          {(field) => (
            <div className="w-32 shrink-0">
              <TimeInput value={field.value} onValueChange={field.onChange} aria-label="Start time" />
            </div>
          )}
        </FormField>
      )}
    </div>
  );
}
