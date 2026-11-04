/**
 * Money is always integer minor units (`priceCents`) + ISO currency ("EUR").
 * Never format money by hand — use these.
 */
import { DEFAULT_LOCALE } from "./locale";

type MoneyOptions = {
  locale?: string;
  /** Always show minor units ("€45.00"). Default: only when non-zero ("€45", "€45.50"). */
  exact?: boolean;
  /** "+€5" for add-ons / deltas. */
  signed?: boolean;
};

const cache = new Map<string, Intl.NumberFormat>();
function formatter(currency: string, locale: string, fractionDigits: number, signed: boolean) {
  const key = `${locale}|${currency}|${fractionDigits}|${signed}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
      signDisplay: signed ? "exceptZero" : "auto",
    });
    cache.set(key, f);
  }
  return f;
}

const digitsCache = new Map<string, number>();
function currencyFractionDigits(currency: string, locale = DEFAULT_LOCALE): number {
  const key = `${locale}|${currency}`;
  let digits = digitsCache.get(key);
  if (digits === undefined) {
    digits =
      new Intl.NumberFormat(locale, { style: "currency", currency }).resolvedOptions()
        .maximumFractionDigits ?? 2;
    digitsCache.set(key, digits);
  }
  return digits;
}

/** 4550, "EUR" → "€45.50"; 4500 → "€45"; exact → "€45.00". */
export function formatMoney(cents: number, currency: string, options: MoneyOptions = {}): string {
  const { locale = DEFAULT_LOCALE, exact = false, signed = false } = options;
  const digits = currencyFractionDigits(currency, locale);
  const major = cents / 10 ** digits;
  const whole = Number.isInteger(major);
  return formatter(currency, locale, exact || !whole ? digits : 0, signed).format(major);
}

/** "Free" for zero, otherwise formatMoney. */
export function formatPrice(cents: number, currency: string, options: MoneyOptions = {}): string {
  return cents === 0 ? "Free" : formatMoney(cents, currency, options);
}

const symbolCache = new Map<string, string>();
export function currencySymbol(currency: string, locale = DEFAULT_LOCALE): string {
  const key = `${locale}|${currency}`;
  let symbol = symbolCache.get(key);
  if (symbol === undefined) {
    const part = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    })
      .formatToParts(0)
      .find((p) => p.type === "currency");
    symbol = part?.value ?? currency;
    symbolCache.set(key, symbol);
  }
  return symbol;
}

/**
 * Parse user input into minor units. Accepts "45", "45.5", "45,50", "€1,234.50", "1.234,50", "1,234,567".
 * Returns null for empty/invalid input.
 */
export function parseMoney(input: string, currency = "EUR", locale = DEFAULT_LOCALE): number | null {
  const digits = currencyFractionDigits(currency, locale);
  let s = input.replace(/[^\d.,-]/g, "");
  if (!s || s === "-") return null;
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  const decimalSep = lastDot > lastComma ? "." : lastComma > lastDot ? "," : null;
  if (decimalSep) {
    const idx = s.lastIndexOf(decimalSep);
    const fraction = s.slice(idx + 1);
    // A separator that repeats ("1,234,567") can only group thousands: a number has one decimal point.
    // "1,234" (3 trailing digits, single separator) is a thousands separator too, not decimals; never after a
    // whole part of 0 ("0.125" is not 125).
    const whole = s.slice(0, idx).replace(/^-/, "");
    const repeated = s.split(decimalSep).length - 1 > 1;
    const isThousands =
      repeated ||
      (fraction.length === 3 &&
        whole !== "" &&
        Number(whole) !== 0 &&
        digits !== 3 &&
        (decimalSep === "," ? !s.includes(".") : !s.includes(",")));
    if (isThousands) {
      s = s.replace(/[.,]/g, "");
    } else {
      s = s.slice(0, idx).replace(/[.,]/g, "") + "." + fraction.replace(/[.,]/g, "");
    }
  }
  const value = Number(s);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 10 ** digits);
}

/** Minor units → plain editable string ("45.50"), for inputs. */
export function centsToInput(
  cents: number | null | undefined,
  currency = "EUR",
  locale = DEFAULT_LOCALE,
): string {
  if (cents === null || cents === undefined) return "";
  const digits = currencyFractionDigits(currency, locale);
  return (cents / 10 ** digits).toFixed(digits);
}
