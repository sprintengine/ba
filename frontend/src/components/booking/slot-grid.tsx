"use client";

import { useMemo } from "react";
import { Moon, Sun, Sunrise, Tag } from "lucide-react";
import type { Slot } from "@/lib/api/types";
import { groupByDayPeriod, type PeriodGroup } from "@/lib/booking/periods";
import { formatTime, toTimeOfDay } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { DealPrice } from "@/components/offers/deal-price";

const PERIOD_ICONS = { morning: Sunrise, afternoon: Sun, evening: Moon };

function PeriodIcon({ period }: { period: PeriodGroup<unknown>["key"] }) {
  if (period === "all") return null;
  const Icon = PERIOD_ICONS[period];
  return <Icon className="size-3.5" aria-hidden />;
}

/** A day's times as buttons, grouped by morning/afternoon/evening when there are many; deals highlighted. */
export function SlotGrid({
  slots,
  timeZone,
  locale,
  currency,
  selectedTime,
  onSelect,
}: {
  slots: Slot[];
  timeZone: string;
  locale?: string;
  currency?: string;
  selectedTime: string | null;
  onSelect: (slot: Slot) => void;
}) {
  const hasDeals = slots.some((s) => s.offer);
  const grouped = useMemo(
    () =>
      groupByDayPeriod(
        slots.map((s) => ({ slot: s, time: toTimeOfDay(s.start, timeZone) })),
        (x) => x.time,
      ),
    [slots, timeZone],
  );

  return (
    <div className="@container flex animate-fade-in flex-col gap-4" role="group" aria-label="Available times">
      {hasDeals && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Tag className="size-3.5 text-brand" aria-hidden />
          Highlighted times have a deal
        </p>
      )}
      {grouped.map((g) => (
        <div key={g.key} className="flex flex-col gap-2">
          {g.label && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-subtle-foreground">
              <PeriodIcon period={g.key} />
              {g.label}
            </p>
          )}
          <div
            className={cn(
              "grid grid-cols-3 gap-2 @sm:grid-cols-4 @xl:grid-cols-5",
              hasDeals && "gap-y-3.5 pt-1",
            )}
          >
            {g.items.map(({ slot, time }) => {
              const selected = selectedTime === time;
              const fewSeats = slot.seatsLeft !== null && slot.seatsLeft <= 5;
              const deal = slot.offer ?? null;
              return (
                <button
                  key={slot.start}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelect(slot)}
                  className={cn(
                    "tnum relative flex h-11 flex-col items-center justify-center rounded-lg border text-[0.9375rem] font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 outline-none active:scale-[0.97] pointer-coarse:h-12",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    selected
                      ? "border-primary bg-primary text-primary-foreground shadow-button"
                      : "border-border bg-surface text-foreground shadow-xs hover:border-brand-border hover:bg-brand-soft hover:text-brand-soft-foreground dark:bg-surface-raised",
                    deal && !selected && "border-brand-border bg-brand-soft/50 dark:bg-brand-soft/40",
                    fewSeats && "h-12 pointer-coarse:h-13",
                    deal && "h-auto min-h-14 gap-0.5 pt-2.5 pb-1.5",
                  )}
                >
                  {deal && (
                    <span
                      className={cn(
                        "absolute -top-2 right-1.5 max-w-[calc(100%-0.75rem)] truncate rounded-full px-1.5 text-2xs leading-4 font-semibold shadow-xs",
                        selected ? "bg-primary-foreground text-primary" : "bg-brand text-brand-foreground",
                      )}
                    >
                      {deal.label}
                    </span>
                  )}
                  <span>{formatTime(slot.start, timeZone, locale)}</span>
                  {deal && currency && (
                    <DealPrice
                      originalCents={deal.originalPriceCents}
                      priceCents={deal.priceCents}
                      currency={currency}
                      locale={locale}
                      inverted={selected}
                      className="justify-center text-2xs leading-none font-normal"
                      priceClassName={selected ? undefined : "text-brand-soft-foreground"}
                    />
                  )}
                  {fewSeats && (
                    <span
                      className={cn(
                        "text-2xs leading-none font-normal",
                        selected ? "text-primary-foreground/80" : "text-muted-foreground",
                      )}
                    >
                      {slot.seatsLeft} {slot.seatsLeft === 1 ? "place" : "places"} left
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function SlotsSkeleton() {
  return (
    <div
      className="@container flex flex-col gap-4"
      role="status"
      aria-busy
      aria-label="Loading available times"
    >
      <Skeleton className="h-5 w-48" />
      <div className="grid grid-cols-3 gap-2 @sm:grid-cols-4 @xl:grid-cols-5">
        {Array.from({ length: 9 }, (_, i) => (
          <Skeleton key={i} className="h-11 rounded-lg" style={{ animationDelay: `${i * 40}ms` }} />
        ))}
      </div>
    </div>
  );
}
