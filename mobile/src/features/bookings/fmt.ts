/**
 * Formatting bound to the current business (timezone, locale, currency): the website's `useFmt` (dashboard/common).
 * Dates and times are always in the business's timezone, never the phone's.
 */
import { useMemo } from "react";
import { useCurrentBusiness } from "@shared/business/business-context";
import {
  DEFAULT_LOCALE,
  formatDate,
  formatDateTime,
  formatDuration,
  formatMoney,
  formatPrice,
  formatRelativeDay,
  formatTime,
  formatTimeRange,
  type DateStyle,
} from "@shared/format";

export type Fmt = ReturnType<typeof makeFmt>;

export function makeFmt(business: { timezone: string; locale: string | null; currency: string }) {
  const tz = business.timezone;
  const locale = business.locale || DEFAULT_LOCALE;
  return {
    tz,
    locale,
    currency: business.currency,
    time: (iso: string | Date) => formatTime(iso, tz, locale),
    range: (start: string, end: string) => formatTimeRange(start, end, tz, locale),
    date: (value: string, style: DateStyle = "medium") => formatDate(value, tz, style, locale),
    dateTime: (iso: string) => formatDateTime(iso, tz, locale),
    relDay: (value: string) => formatRelativeDay(value, tz, locale),
    /** `currency`: the amount's own (a booking's or payment's); the business's by default. */
    money: (cents: number, opts?: { exact?: boolean; signed?: boolean; currency?: string }) =>
      formatMoney(cents, opts?.currency ?? business.currency, { locale, ...opts }),
    price: (cents: number, currency?: string) =>
      formatPrice(cents, currency ?? business.currency, { locale }),
    duration: formatDuration,
  };
}

export function useFmt(): Fmt {
  const b = useCurrentBusiness();
  return useMemo(
    () => makeFmt({ timezone: b.timezone, locale: b.locale, currency: b.currency }),
    [b.timezone, b.locale, b.currency],
  );
}
