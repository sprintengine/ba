"use client";

import { useMemo } from "react";
import { useWatch } from "react-hook-form";
import { CalendarSearch, CircleAlert, RotateCw } from "lucide-react";
import type { OfferPreview, OfferPreviewInput } from "@/lib/api/types";
import { errorMessage } from "@/lib/api/client";
import { useOfferPreview } from "@/lib/api/hooks";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { previewInput, PREVIEW_DAYS, type OfferFormValues } from "@/lib/offers/offer-form";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useFmt } from "@/components/dashboard/common";
import { DealPrice } from "./deal-price";

/** Slots listed per day before collapsing into "+N more". */
const PER_DAY = 6;

/**
 * Live "Affected times" for the offer form (must be inside its `<Form>`): once the draft is valid,
 * asks the API which bookable times in the next week it would discount (debounced).
 */
export function AffectedSlotsPreview({ delay = 400 }: { delay?: number }) {
  const business = useCurrentBusiness();
  const values = useWatch<OfferFormValues>() as OfferFormValues;
  // Keyed by content so re-renders without changes don't restart the debounce.
  const key = useMemo(() => {
    const input = previewInput(values);
    return input ? JSON.stringify(input) : null;
  }, [values]);
  const debouncedKey = useDebouncedValue(key, delay);
  const request = useMemo(
    () => (debouncedKey ? (JSON.parse(debouncedKey) as OfferPreviewInput) : null),
    [debouncedKey],
  );
  const preview = useOfferPreview(business.id, key ? request : null);
  const settling = key !== debouncedKey || preview.isFetching;

  return (
    <section aria-labelledby="affected-times" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h3
          id="affected-times"
          className="text-xs font-medium tracking-wide text-subtle-foreground uppercase"
        >
          Affected times
        </h3>
        {key && settling && preview.data && (
          <span className="text-xs text-subtle-foreground" aria-live="polite">
            Updating…
          </span>
        )}
      </div>
      {!key ? (
        <Hint
          title="Nothing to preview yet"
          text="Pick at least one service and a valid discount and schedule to see which times this deal would discount."
        />
      ) : preview.isError && !preview.data ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-xl border border-danger-border bg-danger-soft p-4 text-sm text-danger-soft-foreground"
        >
          <p className="flex gap-2">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              <strong className="font-medium">We couldn&apos;t load the preview.</strong>{" "}
              {errorMessage(preview.error)}
            </span>
          </p>
          <Button size="sm" variant="secondary" onClick={() => preview.refetch()}>
            <RotateCw /> Try again
          </Button>
        </div>
      ) : !preview.data ? (
        <div className="flex flex-col gap-3" role="status" aria-busy aria-label="Loading affected times">
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      ) : (
        <PreviewResult preview={preview.data} />
      )}
    </section>
  );
}

function PreviewResult({ preview }: { preview: OfferPreview }) {
  const fmt = useFmt();
  const { affectedSlots: affected, totalSlots: total } = preview;
  const pct = total > 0 ? Math.round((affected / total) * 100) : 0;
  const listed = preview.days.reduce((n, d) => n + d.slots.length, 0);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-surface p-4 shadow-xs dark:bg-surface-raised">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          <strong className="tnum text-2xl font-semibold tracking-tight text-foreground">{affected}</strong>{" "}
          of <span className="tnum">{total}</span> times in the next {PREVIEW_DAYS} days
        </p>
        <div
          className="h-1.5 overflow-hidden rounded-full bg-muted"
          role="meter"
          aria-label="Share of times discounted"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      </div>
      {total === 0 ? (
        <Hint
          title="Nothing bookable this week"
          text="None of these services has free times in the next 7 days, so there's nothing to discount yet."
        />
      ) : affected === 0 ? (
        <Hint title="No times match" text="Try more days, wider hours or a longer last-minute window." />
      ) : (
        <ol className="flex flex-col gap-4">
          {preview.days.map((day) => (
            <li key={day.date} className="flex flex-col gap-1.5">
              <h4 className="text-sm font-medium">{fmt.relDay(day.date)}</h4>
              <ul className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border bg-surface text-sm dark:bg-surface-raised">
                {day.slots.slice(0, PER_DAY).map((s) => (
                  <li
                    key={`${s.start}-${s.serviceId}`}
                    className="flex items-baseline justify-between gap-3 px-3 py-2"
                  >
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="tnum font-medium">{fmt.time(s.start)}</span>
                      <span className="truncate text-xs text-muted-foreground">{s.serviceName}</span>
                    </span>
                    <DealPrice
                      originalCents={s.originalPriceCents}
                      priceCents={s.priceCents}
                      currency={preview.currency}
                      locale={fmt.locale}
                      className="shrink-0 text-xs"
                    />
                  </li>
                ))}
                {day.slots.length > PER_DAY && (
                  <li className="px-3 py-1.5 text-xs text-muted-foreground">
                    + {day.slots.length - PER_DAY} more
                  </li>
                )}
              </ul>
            </li>
          ))}
          {listed < affected && (
            <li className="text-xs text-muted-foreground">Showing the first {listed} times.</li>
          )}
        </ol>
      )}
    </div>
  );
}

function Hint({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-surface-sunken/50 px-4 py-8 text-center">
      <CalendarSearch className="size-5 text-subtle-foreground" aria-hidden />
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-xs text-xs text-muted-foreground">{text}</p>
    </div>
  );
}
