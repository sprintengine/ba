import { useMemo } from "react";
import { useBusinessContext } from "@shared/business/business-context";
import {
  currencySymbol,
  DEFAULT_LOCALE,
  formatDate,
  formatDuration,
  formatMoney,
  formatPrice,
  formatRelativeDay,
  formatTime,
  type DateStyle,
} from "@shared/format";
import { compactNumber } from "./chart/geometry";

/**
 * Formatting bound to the current business: its timezone, locale and currency (the website's `useFmt`, which lives
 * in a web component file). Used by reports, offers and billing.
 */
export function useBusinessFormat() {
  const { business: b } = useBusinessContext();
  return useMemo(() => {
    const tz = b.timezone;
    const locale = b.locale || DEFAULT_LOCALE;
    return {
      tz,
      locale,
      currency: b.currency,
      date: (value: string, style: DateStyle = "medium") => formatDate(value, tz, style, locale),
      time: (iso: string) => formatTime(iso, tz, locale),
      relDay: (value: string) => formatRelativeDay(value, tz, locale),
      money: (cents: number) => formatMoney(cents, b.currency, { locale }),
      price: (cents: number, currency?: string) => formatPrice(cents, currency ?? b.currency, { locale }),
      /** An axis tick: "€50", "€1.5K" (minor units per the currency: yen have none). */
      moneyTick: (cents: number) => {
        const major = cents / 10 ** fractionDigits(b.currency, locale);
        return major >= 1000
          ? `${currencySymbol(b.currency, locale)}${compactNumber(major, locale)}`
          : formatMoney(cents, b.currency, { locale });
      },
      duration: formatDuration,
    };
  }, [b.timezone, b.locale, b.currency]);
}

/** Minor-unit digits of a currency (2 for EUR, 0 for JPY), as `formatMoney` reads amounts. */
export function fractionDigits(currency: string, locale: string): number {
  return (
    new Intl.NumberFormat(locale, { style: "currency", currency }).resolvedOptions().maximumFractionDigits ??
    2
  );
}

export type BusinessFormat = ReturnType<typeof useBusinessFormat>;
