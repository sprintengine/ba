"use client";

import { useId, useState } from "react";
import { useController, useForm, useFormContext, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarOff, Clock, Plus, SunMedium, Trash2 } from "lucide-react";
import type { AvailabilityOverride, AvailabilityOverrideInput } from "@/lib/api/types";
import {
  useClosures,
  useCreateClosure,
  useCreateResourceOverride,
  useDeleteOverride,
  useResourceAvailability,
} from "@/lib/api/hooks";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { todayInTz } from "@/lib/format/datetime";
import { ErrorState } from "@/components/common/feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { FormDialog } from "@/components/ui/form-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { applyApiErrors, FormField, FormRootError } from "@/components/ui/form";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { RadioCard, RadioCards } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { TimeInput } from "@/components/ui/time-input";
import { toast } from "@/components/ui/toast";
import { withToast } from "@/components/common/with-toast";
import { useFmt } from "../common";
import {
  OVERRIDE_KIND_LABEL,
  overrideKind,
  timeOffDefaults,
  timeOffReady,
  timeOffSchema,
  timeOffTimeError,
  timeOffToInput,
  type TimeOffValues,
} from "@/lib/availability/time-off";

/** Date exceptions for one resource: days off, partial unavailability, extra hours. */
export function TimeOff({ resourceId, editable }: { resourceId: string; editable: boolean }) {
  const business = useCurrentBusiness();
  const availability = useResourceAvailability(business.id, resourceId);
  const create = useCreateResourceOverride(business.id, resourceId);
  const today = todayInTz(business.timezone);
  const [adding, setAdding] = useState(false);
  if (availability.isPending)
    return (
      <div role="status" aria-label="Loading time off">
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  if (availability.isError)
    return <ErrorState error={availability.error} onRetry={() => availability.refetch()} />;
  const upcoming = availability.data.overrides
    .filter((o) => o.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? "").localeCompare(b.startTime ?? ""));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Holidays, appointments, one-off late nights. These override the weekly hours on that date.
        </p>
        {editable && (
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
            <Plus /> Add
          </Button>
        )}
      </div>
      <OverrideList
        items={upcoming}
        editable={editable}
        empty={
          <EmptyState
            size="sm"
            icon={<SunMedium />}
            title="Nothing planned"
            description="No time off or extra hours coming up."
          />
        }
      />
      <OverrideDialog
        open={adding}
        onOpenChange={setAdding}
        allowExtra
        title="Add time off or extra hours"
        onSubmit={async (input) => {
          await create.mutateAsync(input);
          toast.success("Added");
        }}
      />
    </div>
  );
}

/** Business-wide closures (bank holidays etc.) — admins only. */
export function Closures({ editable }: { editable: boolean }) {
  const business = useCurrentBusiness();
  const closures = useClosures(business.id);
  const create = useCreateClosure(business.id);
  const today = todayInTz(business.timezone);
  const [adding, setAdding] = useState(false);
  const upcoming = (closures.data ?? [])
    .filter((o) => o.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Closed days</h2>
          <p className="text-sm text-muted-foreground">
            When the whole business is closed — nobody can be booked.
          </p>
        </div>
        {editable && (
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
            <CalendarOff /> Add closure
          </Button>
        )}
      </div>
      {closures.isPending ? (
        <div role="status" aria-label="Loading closed days">
          <Skeleton className="h-24 rounded-xl" />
        </div>
      ) : closures.isError ? (
        <ErrorState error={closures.error} onRetry={() => closures.refetch()} />
      ) : (
        <OverrideList
          items={upcoming}
          editable={editable}
          empty={
            <EmptyState
              size="sm"
              icon={<CalendarOff />}
              title="No closures planned"
              description="Add bank holidays or a team day out."
            />
          }
        />
      )}
      <OverrideDialog
        open={adding}
        onOpenChange={setAdding}
        title="Close the business"
        onSubmit={async (input) => {
          await create.mutateAsync(input);
          toast.success("Closure added");
        }}
      />
    </section>
  );
}

function OverrideList({
  items,
  editable,
  empty,
}: {
  items: AvailabilityOverride[];
  editable: boolean;
  empty: React.ReactNode;
}) {
  const business = useCurrentBusiness();
  const fmt = useFmt();
  const remove = useDeleteOverride(business.id);
  if (items.length === 0)
    return <div className="rounded-xl border border-dashed border-border-strong">{empty}</div>;
  return (
    <ul className="flex flex-col divide-y divide-border-subtle rounded-xl border border-border bg-surface dark:bg-surface-raised">
      {items.map((o) => {
        const kind = overrideKind(o);
        return (
          <li key={o.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="flex size-9 shrink-0 flex-col items-center justify-center rounded-lg bg-muted leading-none">
              <span className="text-2xs font-medium text-muted-foreground uppercase">
                {fmt.date(o.date, "weekday")}
              </span>
              <span className="tnum text-sm font-semibold">{Number(o.date.slice(8))}</span>
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex items-center gap-2 text-sm font-medium">
                {fmt.date(o.date, "medium")}
                <Badge
                  tone={kind === "extra" ? "success" : kind === "off" ? "neutral" : "warning"}
                  className="h-5"
                >
                  {OVERRIDE_KIND_LABEL[kind]}
                </Badge>
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {o.startTime && o.endTime ? `${o.startTime}–${o.endTime}` : "All day"}
                {o.reason ? ` · ${o.reason}` : ""}
              </span>
            </span>
            {editable && (
              <IconButton
                label={`Remove ${fmt.date(o.date, "medium")}`}
                loading={remove.isPending && remove.variables === o.id}
                onClick={async () => {
                  await withToast(() => remove.mutateAsync(o.id), "Removed");
                }}
              >
                <Trash2 />
              </IconButton>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function OverrideDialog({
  open,
  onOpenChange,
  onSubmit,
  allowExtra,
  title,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: AvailabilityOverrideInput) => Promise<void>;
  allowExtra?: boolean;
  title: string;
}) {
  const business = useCurrentBusiness();
  const today = todayInTz(business.timezone);
  const form = useForm<TimeOffValues>({
    resolver: zodResolver(timeOffSchema),
    defaultValues: timeOffDefaults(today),
  });
  const values = useWatch({ control: form.control }) as TimeOffValues;
  const timed = values.kind !== "off";

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      title={title}
      description="Existing bookings aren't changed — move or cancel them separately."
      submitLabel="Save"
      submitDisabled={!timeOffReady(values)}
      onSubmit={async (v) => {
        if (!v.date) return;
        try {
          await onSubmit(timeOffToInput({ ...v, date: v.date }));
          onOpenChange(false);
          form.reset({ ...v, reason: "" });
        } catch (err) {
          applyApiErrors(form, err);
        }
      }}
    >
      <FormField<TimeOffValues, "date"> name="date" label="Date">
        {(field) => (
          <DatePicker
            value={field.value}
            onValueChange={field.onChange}
            min={today}
            timeZone={business.timezone}
          />
        )}
      </FormField>
      <FormField<TimeOffValues, "kind"> name="kind" label="Type">
        {(field) => (
          <RadioCards value={field.value} onValueChange={field.onChange} columns={allowExtra ? 3 : 2}>
            <RadioCard
              value="off"
              icon={<CalendarOff />}
              title={allowExtra ? "Day off" : "All day"}
              className="p-3"
            />
            <RadioCard value="partial" icon={<Clock />} title="Part of the day" className="p-3" />
            {allowExtra && <RadioCard value="extra" icon={<Plus />} title="Extra hours" className="p-3" />}
          </RadioCards>
        )}
      </FormField>
      {timed && <TimeRangeField label={values.kind === "extra" ? "Available" : "Unavailable"} />}
      <FormField<TimeOffValues, "reason">
        name="reason"
        label="Note"
        optional
        help="Only your team sees this."
      >
        {(field) => <Input {...field} placeholder="e.g. Training day" />}
      </FormField>
      <FormRootError />
    </FormDialog>
  );
}

/** From–until times, checked as they change; the server's errors on either time show here too. */
function TimeRangeField({ label }: { label: string }) {
  const form = useFormContext<TimeOffValues>();
  const { field: start, fieldState: startState } = useController({
    control: form.control,
    name: "startTime",
  });
  const { field: end, fieldState: endState } = useController({ control: form.control, name: "endTime" });
  const kind = useWatch({ control: form.control, name: "kind" });
  // The start takes the Field's id (its label points there); the end needs its own.
  const endId = useId();
  const error =
    timeOffTimeError({ kind, startTime: start.value, endTime: end.value }) ??
    startState.error?.message ??
    endState.error?.message;
  return (
    <Field label={label} error={error}>
      <div className="flex items-center gap-2">
        <div className="w-32 shrink-0">
          <TimeInput value={start.value} onValueChange={start.onChange} aria-label={`${label} from`} />
        </div>
        <span className="text-subtle-foreground">–</span>
        <TimeInput id={endId} value={end.value} onValueChange={end.onChange} aria-label={`${label} until`} />
      </div>
    </Field>
  );
}
