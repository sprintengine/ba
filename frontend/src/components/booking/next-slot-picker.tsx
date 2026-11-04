"use client";

import { ArrowRight, CalendarClock, Check, RotateCcw } from "lucide-react";
import type { NextSlot } from "@/lib/api/hooks";
import type { Slot } from "@/lib/api/types";
import {
  diffPlainDates,
  formatDate,
  formatRelativeDay,
  formatTime,
  toPlainDate,
  todayInTz,
} from "@/lib/format";
import { touchHitArea } from "@/components/ui/touch";
import { cn } from "@/lib/utils";
import { ErrorState } from "@/components/common/feedback";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DealPrice } from "@/components/offers/deal-price";
import { opensLabel } from "@/lib/releases/text";
import { DateTile } from "./date-tile";
import { useRefetchAt } from "./locked-day";
import { NoTimesAtAll } from "./slot-picker";
import { TimezoneNote } from "./timezone-note";

export type NextSlotPickerProps = {
  timeZone: string;
  locale?: string;
  /** Business currency; needed to show a deal price on a discounted time (§19). */
  currency?: string;
  next: NextSlot;
  /** The customer asked for a later time, so this isn't the earliest one. */
  stepped: boolean;
  /** The offered time is the one already chosen. */
  selected: boolean;
  /** The main action, e.g. "Book this time". */
  chooseLabel: string;
  onChoose: (slot: Slot) => void;
  /** Offers the next time after `slot`. */
  onLater: (slot: Slot) => void;
  /** Goes back to the earliest time. */
  onEarliest: () => void;
  /** Rendered above the time (e.g. "that time was just taken"). */
  notice?: React.ReactNode;
};

/**
 * For businesses that offer their next available time only: one time at a time instead of a calendar, with
 * "Show a later time" to step forward and a way back to the earliest. Times are in the business timezone.
 */
export function NextSlotPicker({
  timeZone,
  locale,
  currency,
  next,
  stepped,
  selected,
  chooseLabel,
  onChoose,
  onLater,
  onEarliest,
  notice,
}: NextSlotPickerProps) {
  // More times open later (a release schedule, §21): say when, and look again then.
  useRefetchAt(next.opensAt, next.refetch);
  const opening = next.opensAt ? opensLabel(next.opensAt, timeZone, locale) : null;
  return (
    <div className="flex flex-col gap-5">
      {notice}
      {next.isError && !next.slot ? (
        <ErrorState
          error={next.error}
          onRetry={next.refetch}
          title="We couldn't find the next available time"
        />
      ) : next.slot ? (
        <OfferedTime
          slot={next.slot}
          timeZone={timeZone}
          locale={locale}
          currency={currency}
          stepped={stepped}
          selected={selected}
          busy={next.isFetching}
          chooseLabel={chooseLabel}
          onChoose={onChoose}
          onLater={onLater}
          onEarliest={onEarliest}
        />
      ) : next.none ? (
        opening ? (
          <NextOpening when={opening} onEarliest={stepped ? onEarliest : undefined} />
        ) : stepped ? (
          <NoLaterTimes onEarliest={onEarliest} />
        ) : (
          <NoTimesAtAll />
        )
      ) : (
        <OfferedTimeSkeleton />
      )}
      {next.slot && opening && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarClock className="size-4 shrink-0" /> More times open {opening}.
        </p>
      )}
      <TimezoneNote timeZone={timeZone} />
    </div>
  );
}

function OfferedTime({
  slot,
  timeZone,
  locale,
  currency,
  stepped,
  selected,
  busy,
  chooseLabel,
  onChoose,
  onLater,
  onEarliest,
}: Omit<NextSlotPickerProps, "next" | "notice"> & { slot: Slot; busy: boolean }) {
  const date = toPlainDate(slot.start, timeZone);
  // "Today · Thursday 1 October"; further out the date alone.
  const soon = diffPlainDates(date, todayInTz(timeZone)) <= 1;
  const longDate = formatDate(date, timeZone, "long", locale);
  const deal = slot.offer ?? null;
  const fewSeats = slot.seatsLeft !== null && slot.seatsLeft <= 5;
  return (
    <section
      aria-labelledby="next-slot-heading"
      aria-busy={busy}
      className={cn(
        "flex animate-fade-in flex-col gap-5 rounded-2xl border bg-surface p-5 shadow-xs sm:p-6 dark:bg-surface-raised",
        selected ? "border-primary" : "border-border",
        busy && "opacity-70 transition-opacity",
      )}
    >
      <div className="flex items-start gap-4">
        <DateTile date={date} timeZone={timeZone} size="md" />
        <div className="flex min-w-0 flex-col gap-1" aria-live="polite">
          <p
            id="next-slot-heading"
            className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-brand uppercase"
          >
            <CalendarClock className="size-3.5" aria-hidden />
            {selected ? "Your chosen time" : stepped ? "Next available after that" : "Next available"}
          </p>
          <p className="text-lg font-semibold tracking-tight">
            {soon ? `${formatRelativeDay(date, timeZone, locale)} · ${longDate}` : longDate}
          </p>
          <p className="tnum text-base text-muted-foreground">
            {formatTime(slot.start, timeZone, locale)} – {formatTime(slot.end, timeZone, locale)}
          </p>
          {deal && (
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full bg-brand px-2 text-2xs leading-5 font-semibold text-brand-foreground">
                {deal.label}
              </span>
              {currency && (
                <DealPrice
                  originalCents={deal.originalPriceCents}
                  priceCents={deal.priceCents}
                  currency={currency}
                  locale={locale}
                />
              )}
            </p>
          )}
          {fewSeats && (
            <p className="text-sm text-muted-foreground">
              {slot.seatsLeft} {slot.seatsLeft === 1 ? "place" : "places"} left
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="primary" size="lg" aria-pressed={selected} onClick={() => onChoose(slot)}>
          {selected && <Check aria-hidden />}
          {chooseLabel}
        </Button>
        <Button variant="secondary" size="lg" disabled={busy} onClick={() => onLater(slot)}>
          Show a later time
          <ArrowRight aria-hidden />
        </Button>
      </div>
      {stepped && (
        <Button variant="link" size="sm" className={cn("self-start", touchHitArea)} onClick={onEarliest}>
          <RotateCcw aria-hidden />
          Back to the earliest time
        </Button>
      )}
    </section>
  );
}

function NoLaterTimes({ onEarliest }: { onEarliest: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border bg-surface-sunken/50 p-5">
      <div>
        <p className="font-medium">No later times available</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          That was the last time open for online booking for now.
        </p>
      </div>
      <Button variant="soft" size="sm" onClick={onEarliest}>
        <RotateCcw aria-hidden />
        Back to the earliest time
      </Button>
    </div>
  );
}

function OfferedTimeSkeleton() {
  return (
    <div
      className="flex flex-col gap-5 rounded-2xl border border-border p-5 sm:p-6"
      role="status"
      aria-busy
      aria-label="Finding the next available time"
    >
      <div className="flex items-start gap-4">
        <Skeleton className="h-16 w-14 rounded-xl" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-5 w-32" />
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Skeleton className="h-11 rounded-lg sm:w-40" />
        <Skeleton className="h-11 rounded-lg sm:w-44" />
      </div>
    </div>
  );
}

/** Nothing free now, but closed days open later (a release schedule, §21). */
function NextOpening({ when, onEarliest }: { when: string; onEarliest?: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-border bg-surface p-5 dark:bg-surface-raised">
      <p className="font-medium">More times open {when}</p>
      <p className="text-sm text-muted-foreground">
        Nothing is free for online booking right now. Come back then to book.
      </p>
      {onEarliest && (
        <Button variant="soft" size="sm" onClick={onEarliest}>
          <RotateCcw /> Back to the earliest time
        </Button>
      )}
    </div>
  );
}
