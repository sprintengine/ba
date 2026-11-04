"use client";

import { useState } from "react";
import type { Booking, Slot } from "@/lib/api/types";
import { errorMessage, isApiError } from "@/lib/api/client";
import { useRescheduleBooking } from "@/lib/api/hooks";
import { useBusinessContext, usePermissions } from "@/lib/business/business-context";
import { toPlainDate, todayInTz, zonedToIso } from "@/lib/format/datetime";
import { useVocabulary } from "@/lib/vocabulary";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { TimeInput } from "@/components/ui/time-input";
import { toast } from "@/components/ui/toast";
import { useFmt } from "../common";
import { SlotPicker } from "./slot-picker";

/** Move a booking to a free slot (staff availability) or an exact time. */
export function RescheduleDialog({
  booking,
  open,
  onOpenChange,
}: {
  booking: Booking;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // The form mounts with the dialog's content, so every opening (and another booking) starts afresh.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <RescheduleForm key={booking.id} booking={booking} onOpenChange={onOpenChange} />
      </DialogContent>
    </Dialog>
  );
}

function RescheduleForm({
  booking,
  onOpenChange,
}: {
  booking: Booking;
  onOpenChange: (open: boolean) => void;
}) {
  const { business } = useBusinessContext();
  const perms = usePermissions();
  const { v } = useVocabulary();
  const fmt = useFmt();
  const reschedule = useRescheduleBooking(business.id);
  const today = todayInTz(business.timezone);
  const current = toPlainDate(booking.start, business.timezone);
  const [date, setDate] = useState(current < today ? today : current);
  const primary = booking.resources.find((r) => r.kind === "person") ?? booking.resources[0] ?? null;
  const [keep, setKeep] = useState<string>(primary ? primary.id : "any");
  const [mode, setMode] = useState<"slots" | "exact">("slots");
  const [slot, setSlot] = useState<Slot | null>(null);
  const [exact, setExact] = useState<string | null>(null);
  const [notify, setNotify] = useState(true);

  const start =
    mode === "slots" ? (slot?.start ?? null) : exact ? zonedToIso(date, exact, business.timezone) : null;

  const chosenResources = (): string[] | null => {
    if (mode === "slots") return slot ? slot.resourceIds : null;
    return keep !== "any" ? [keep] : null;
  };

  const submit = async () => {
    if (!start) return;
    try {
      await reschedule.mutateAsync({
        id: booking.id,
        input: {
          start,
          // Staff: the backend keeps their own calendar; admins pin the chosen assignment (the free time's, or
          // at an exact time the "With" choice, which the backend would otherwise reassign to anyone free).
          resourceIds: perms.bookAnyCalendar ? chosenResources() : null,
          notifyCustomer: notify,
        },
      });
      toast.success(`Moved to ${fmt.date(start, "dayMonth")}, ${fmt.time(start)}`);
      onOpenChange(false);
    } catch (err) {
      if (isApiError(err) && err.code === "SLOT_UNAVAILABLE") {
        toast.error("That time was just taken. Pick another one.");
        setSlot(null);
      } else {
        toast.error(errorMessage(err));
      }
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Reschedule</DialogTitle>
        <DialogDescription>
          {booking.customer.name} · {booking.service.name}
          {booking.option ? ` (${booking.option.name})` : ""} · currently{" "}
          {fmt.date(booking.start, "dayMonth")}, {fmt.time(booking.start)}
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date">
            <DatePicker
              value={date}
              onValueChange={(d) => {
                setDate(d);
                setSlot(null);
              }}
              min={today}
              timeZone={business.timezone}
            />
          </Field>
          {booking.resources.length > 0 && (
            <Field label="With">
              <Select
                value={keep}
                onValueChange={(val) => {
                  setKeep(val);
                  setSlot(null);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {primary && <SelectItem value={primary.id}>{primary.name} (same as now)</SelectItem>}
                  <SelectItem value="any">Any available {v("resource")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">Time</span>
            <SegmentedControl
              size="sm"
              aria-label="How to pick the time"
              value={mode}
              onValueChange={setMode}
              options={[
                { value: "slots", label: "Free times" },
                { value: "exact", label: "Exact time" },
              ]}
            />
          </div>
          {mode === "slots" ? (
            <SlotPicker
              serviceId={booking.service.id}
              optionId={booking.option?.id ?? null}
              addonIds={booking.addons.map((a) => a.id)}
              resourceId={keep === "any" ? null : keep}
              date={date}
              onDateChange={(d) => {
                setDate(d);
                setSlot(null);
              }}
              value={slot?.start ?? null}
              onChange={setSlot}
              excludeStart={booking.start}
              excludeBookingId={booking.id}
            />
          ) : (
            <Field help="We still check the time is free. Use this for times between the usual slots.">
              <div className="w-32 shrink-0">
                <TimeInput value={exact} onValueChange={setExact} aria-label="Start time" />
              </div>
            </Field>
          )}
        </div>
        <Field
          orientation="horizontal"
          label={`Email the ${v("customer")}`}
          help="Sends the new date and time."
        >
          <Switch checked={notify} onCheckedChange={setNotify} />
        </Field>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button variant="primary" disabled={!start} loading={reschedule.isPending} onClick={submit}>
          {start ? `Move to ${fmt.time(start)}` : "Pick a time"}
        </Button>
      </DialogFooter>
    </>
  );
}
