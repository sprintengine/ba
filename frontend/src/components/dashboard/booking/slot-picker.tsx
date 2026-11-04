"use client";

import { useMemo } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { CalendarSearch, RotateCw } from "lucide-react";
import type { Slot } from "@/lib/api/types";
import { useStaffAvailability } from "@/lib/api/hooks";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { groupByDayPeriod } from "@/lib/booking/periods";
import { addDaysToPlainDate, toTimeOfDay, type PlainDate } from "@/lib/format/datetime";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useFmt } from "../common";

/**
 * Free start times for a service on a date (staff availability, includes
 * private services). Looks a week ahead so it can offer "next available".
 * Times a deal discounts show its label: staff bookings get deals too.
 */
export function SlotPicker({
  serviceId,
  optionId,
  addonIds,
  resourceId,
  date,
  onDateChange,
  value,
  onChange,
  excludeStart,
  excludeBookingId,
}: {
  serviceId: string;
  optionId: string | null;
  addonIds: string[];
  resourceId?: string | null;
  date: PlainDate;
  onDateChange: (date: PlainDate) => void;
  /** Selected slot start (ISO). */
  value: string | null;
  onChange: (slot: Slot) => void;
  /** Hide this start (e.g. the booking's current time when rescheduling). */
  excludeStart?: string | null;
  /**
   * Rescheduling: the booking being moved. Its own time no longer counts as busy (so
   * overlapping slots are offered) and its customer group and duration are used.
   */
  excludeBookingId?: string | null;
}) {
  const business = useCurrentBusiness();
  const fmt = useFmt();
  const query = {
    serviceId,
    optionId,
    addonIds,
    resourceId: resourceId ?? null,
    excludeBookingId: excludeBookingId ?? null,
    from: date,
    to: addDaysToPlainDate(date, 6),
  };
  const availability = useStaffAvailability(business.id, query, { placeholderData: keepPreviousData });

  const { daySlots, nextDay } = useMemo(() => {
    const days = availability.data?.days ?? [];
    const today = days.find((d) => d.date === date)?.slots ?? [];
    const filtered = today.filter((s) => s.start !== excludeStart);
    const next = days.find((d) => d.date > date && d.slots.length > 0)?.date ?? null;
    return { daySlots: filtered, nextDay: next };
  }, [availability.data, date, excludeStart]);

  if (availability.isPending) {
    return (
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5" aria-busy>
        {Array.from({ length: 10 }, (_, i) => (
          <Skeleton key={i} className="h-9 rounded-lg" />
        ))}
      </div>
    );
  }
  if (availability.isError) {
    return (
      <div
        role="alert"
        className="flex items-center justify-between gap-3 rounded-lg border border-danger-border bg-danger-soft px-3 py-2.5 text-sm text-danger-soft-foreground"
      >
        <span>{errorMessage(availability.error)}</span>
        <Button size="xs" variant="secondary" onClick={() => availability.refetch()}>
          <RotateCw /> Retry
        </Button>
      </div>
    );
  }
  if (daySlots.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-border-strong px-4 py-4 text-sm">
        <span className="flex items-center gap-2 font-medium">
          <CalendarSearch className="size-4 text-subtle-foreground" /> No free times on{" "}
          {fmt.date(date, "dayMonth")}
        </span>
        {nextDay ? (
          <Button size="xs" variant="secondary" onClick={() => onDateChange(nextDay)}>
            Next available: {fmt.date(nextDay, "dayMonth")}
          </Button>
        ) : (
          <span className="text-muted-foreground">
            Nothing in the following week either. Try another date or set an exact time.
          </span>
        )}
      </div>
    );
  }

  // Placeholder times are the previous query's (another service, option or week): shown dimmed, not choosable.
  const stale = availability.isPlaceholderData;
  return (
    <div
      className={cn("flex flex-col gap-3 transition-opacity", stale && "opacity-60")}
      aria-busy={stale || undefined}
    >
      {/* Always headed by period (groupAbove 0), however few times there are. */}
      {groupByDayPeriod(daySlots, (s) => toTimeOfDay(s.start, fmt.tz), 0).map((group) => (
        <SlotGroup
          key={group.key}
          label={group.label ?? ""}
          slots={group.items}
          value={value}
          onChange={onChange}
          disabled={stale}
        />
      ))}
    </div>
  );
}

const ARROW_STEP: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/**
 * One period's times as a radio group: a single tab stop (the chosen time, else the first), arrow keys move and
 * choose, Home/End jump to the ends (the WAI-ARIA radio group pattern).
 */
function SlotGroup({
  label,
  slots,
  value,
  onChange,
  disabled,
}: {
  label: string;
  slots: Slot[];
  value: string | null;
  onChange: (slot: Slot) => void;
  disabled: boolean;
}) {
  const fmt = useFmt();
  const checked = slots.findIndex((s) => s.start === value);
  const tabStop = checked >= 0 ? checked : 0;

  /** Arrow keys (wrapping), Home and End from the time at [current]: choose that time and focus it. */
  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, current: number) => {
    const step = ARROW_STEP[e.key];
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? slots.length - 1
          : step === undefined
            ? null
            : (current + step + slots.length) % slots.length;
    const slot = next === null ? undefined : slots[next];
    if (!slot) return;
    e.preventDefault();
    onChange(slot);
    e.currentTarget.parentElement?.querySelector<HTMLElement>(`[data-start="${slot.start}"]`)?.focus();
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-subtle-foreground">{label}</span>
      <div
        role="radiogroup"
        aria-label={`${label} times`}
        className="grid grid-cols-4 gap-1.5 sm:grid-cols-5"
      >
        {slots.map((slot, i) => {
          const selected = value === slot.start;
          return (
            <button
              key={slot.start}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={i === tabStop ? 0 : -1}
              disabled={disabled}
              data-start={slot.start}
              onClick={() => onChange(slot)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cn(
                "tnum flex min-h-9 flex-col items-center justify-center rounded-lg border py-1 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected
                  ? "border-primary bg-primary text-primary-foreground shadow-button"
                  : "border-border bg-surface hover:border-border-strong hover:bg-accent dark:bg-surface-raised",
              )}
            >
              {fmt.time(slot.start)}
              {slot.offer && (
                <span className={cn("-mt-0.5 text-2xs font-normal", selected ? "opacity-80" : "text-brand")}>
                  {slot.offer.label}
                </span>
              )}
              {slot.seatsLeft !== null && (
                <span
                  className={cn(
                    "-mt-0.5 text-2xs font-normal",
                    selected ? "opacity-80" : "text-muted-foreground",
                  )}
                >
                  {slot.seatsLeft} left
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
