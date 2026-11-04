/**
 * Deal (offer) editor model: the zod schema for the form, conversions between the API `Offer` /
 * `OfferInput` and form values, the live-preview request and API error paths. No React, so it is
 * unit-tested in offer-form.test.ts. Rules mirror the backend (OfferValidation.kt).
 */
import * as z from "zod";
import { DEFAULT_LOCALE } from "@/lib/format/locale";
import { ApiError, isApiError } from "@/lib/api/client";
import type { Discount, Offer, OfferInput, OfferPreviewInput } from "@/lib/api/types";

export const MAX_TIME_WINDOWS = 6;
/** Services one deal can apply to (OfferValidation.MAX_SERVICES). */
export const MAX_OFFER_SERVICES = 50;
export const MAX_FIXED_CENTS = 1_000_000;
export const MAX_REDEMPTIONS = 100_000;
export const LAST_MINUTE_MAX_HOURS = 168;
export const DEFAULT_LAST_MINUTE_HOURS = 3;
/** Days the live preview covers. */
export const PREVIEW_DAYS = 7;

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const time = z.string().regex(TIME_RE, "Use a time like 13:00").nullable();
const windowSchema = z.object({ start: time, end: time });

const discountSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("percent"), percent: z.number().nullable() }),
  z.object({ type: z.literal("fixed"), amountCents: z.number().nullable() }),
]);

export const offerFormSchema = z
  .object({
    name: z.string().trim().min(1, "Give the deal a name").max(80, "Keep it under 80 characters"),
    description: z.string().max(300, "Keep it under 300 characters"),
    serviceIds: z
      .array(z.string())
      .min(1, "Choose at least one service")
      .max(MAX_OFFER_SERVICES, `At most ${MAX_OFFER_SERVICES} services`),
    discount: discountSchema,
    schedule: z.object({
      /** ISO weekdays (Mon = 1); empty = every day. */
      daysOfWeek: z.array(z.number().int().min(1).max(7)),
      timeWindows: z.array(windowSchema).max(MAX_TIME_WINDOWS, `At most ${MAX_TIME_WINDOWS} time windows`),
      /** Kept while the switch is off so toggling back restores it. */
      lastMinuteHours: z.number().nullable(),
    }),
    lastMinute: z.boolean(),
    validFrom: z.string().regex(DATE_RE).nullable(),
    validUntil: z.string().regex(DATE_RE).nullable(),
    /** Empty = unlimited. */
    maxRedemptions: z.number().nullable(),
    active: z.boolean(),
  })
  .superRefine((v, ctx) => {
    const issue: Issue = (path, message) => ctx.addIssue({ code: "custom", path, message });
    checkDiscount(v.discount, issue);
    checkTimeWindows(v.schedule.timeWindows, issue);
    if (v.lastMinute) checkLastMinuteHours(v.schedule.lastMinuteHours, issue);
    if (v.validFrom && v.validUntil && v.validUntil < v.validFrom) {
      issue(["validUntil"], "Must be on or after the start date");
    }
    checkMaxRedemptions(v.maxRedemptions, issue);
  });

type Issue = (path: (string | number)[], message: string) => void;
type FormWindow = z.infer<typeof windowSchema>;

/** A whole percentage from 1 to 100, or a positive amount no larger than any price. */
function checkDiscount(discount: z.infer<typeof discountSchema>, issue: Issue) {
  if (discount.type === "percent") {
    const p = discount.percent;
    if (p === null || Number.isNaN(p)) issue(["discount", "percent"], "Enter a percentage");
    else if (!Number.isInteger(p)) issue(["discount", "percent"], "Use a whole number");
    else if (p < 1 || p > 100) issue(["discount", "percent"], "Between 1% and 100%");
    return;
  }
  const c = discount.amountCents;
  if (c === null || Number.isNaN(c)) issue(["discount", "amountCents"], "Enter an amount");
  else if (c <= 0) issue(["discount", "amountCents"], "Must be more than 0");
  else if (c > MAX_FIXED_CENTS) issue(["discount", "amountCents"], "That's more than any price");
}

/** Each window has a start and a later end, and no complete window overlaps the one before it. */
function checkTimeWindows(windows: FormWindow[], issue: Issue) {
  windows.forEach((w, i) => {
    if (!w.start) issue(["schedule", "timeWindows", i, "start"], "Enter a start time");
    if (!w.end) issue(["schedule", "timeWindows", i, "end"], "Enter an end time");
    if (w.start && w.end && w.end <= w.start)
      issue(["schedule", "timeWindows", i, "end"], "Must end after it starts");
  });
  const complete = windows
    .map((w, i) => ({ ...w, i }))
    .filter((w): w is { start: string; end: string; i: number } => !!w.start && !!w.end && w.end > w.start)
    .sort((a, b) => a.start.localeCompare(b.start));
  let previous: { end: string } | undefined;
  for (const w of complete) {
    if (previous && w.start < previous.end) {
      issue(["schedule", "timeWindows", w.i, "start"], "Overlaps another time window");
    }
    previous = w;
  }
}

function checkLastMinuteHours(hours: number | null, issue: Issue) {
  if (hours === null || Number.isNaN(hours))
    issue(["schedule", "lastMinuteHours"], "Enter a number of hours");
  else if (!Number.isInteger(hours) || hours < 1 || hours > LAST_MINUTE_MAX_HOURS) {
    issue(["schedule", "lastMinuteHours"], `Between 1 and ${LAST_MINUTE_MAX_HOURS} hours (a week)`);
  }
}

/** Empty means unlimited. */
function checkMaxRedemptions(max: number | null, issue: Issue) {
  if (max !== null && (!Number.isInteger(max) || max < 1 || max > MAX_REDEMPTIONS)) {
    issue(
      ["maxRedemptions"],
      `Between 1 and ${MAX_REDEMPTIONS.toLocaleString(DEFAULT_LOCALE)}, or leave empty`,
    );
  }
}

export type OfferFormValues = z.infer<typeof offerFormSchema>;
export type OfferFormDiscount = OfferFormValues["discount"];

/** A new deal: 20% off, any time, on the given services. */
export function defaultOfferForm(serviceIds: string[] = []): OfferFormValues {
  return {
    name: "",
    description: "",
    serviceIds,
    discount: { type: "percent", percent: 20 },
    schedule: { daysOfWeek: [], timeWindows: [], lastMinuteHours: DEFAULT_LAST_MINUTE_HOURS },
    lastMinute: false,
    validFrom: null,
    validUntil: null,
    maxRedemptions: null,
    active: true,
  };
}

export function offerToForm(offer: Offer): OfferFormValues {
  const d = offer.discount;
  return {
    name: offer.name,
    description: offer.description ?? "",
    serviceIds: [...offer.serviceIds],
    discount:
      d.type === "percent"
        ? { type: "percent", percent: d.percent }
        : { type: "fixed", amountCents: d.amountCents },
    schedule: {
      daysOfWeek: [...offer.schedule.daysOfWeek].sort((a, b) => a - b),
      timeWindows: offer.schedule.timeWindows.map((w) => ({ start: w.start, end: w.end })),
      lastMinuteHours: offer.schedule.lastMinuteHours ?? DEFAULT_LAST_MINUTE_HOURS,
    },
    lastMinute: offer.schedule.lastMinuteHours !== null,
    validFrom: offer.validFrom,
    validUntil: offer.validUntil,
    maxRedemptions: offer.maxRedemptions,
    active: offer.status === "active",
  };
}

/** Switching the discount type keeps the other type's last value (so toggling back doesn't lose it). */
export function switchDiscountType(
  current: OfferFormDiscount,
  type: OfferFormDiscount["type"],
  remembered: { percent: number | null; amountCents: number | null },
): OfferFormDiscount {
  if (current.type === type) return current;
  return type === "percent"
    ? { type, percent: remembered.percent }
    : { type, amountCents: remembered.amountCents };
}

function toDiscount(d: OfferFormDiscount): Discount {
  return d.type === "percent"
    ? { type: "percent", percent: d.percent ?? 0 }
    : { type: "fixed", amountCents: d.amountCents ?? 0 };
}

/** Form values (validated) → the API body. Incomplete time windows are dropped; windows and days are sorted. */
export function formToInput(values: OfferFormValues): OfferInput {
  const windows = values.schedule.timeWindows
    .filter((w): w is { start: string; end: string } => !!w.start && !!w.end)
    .sort((a, b) => a.start.localeCompare(b.start));
  return {
    name: values.name.trim(),
    description: values.description.trim() || null,
    serviceIds: [...values.serviceIds],
    discount: toDiscount(values.discount),
    schedule: {
      daysOfWeek: [...new Set(values.schedule.daysOfWeek)].sort((a, b) => a - b),
      timeWindows: windows,
      lastMinuteHours: values.lastMinute ? values.schedule.lastMinuteHours : null,
    },
    validFrom: values.validFrom,
    validUntil: values.validUntil,
    maxRedemptions: values.maxRedemptions,
    active: values.active,
  };
}

const PREVIEW_NAME = "Preview";

/**
 * The preview request for a draft, or null while the draft can't be previewed. The name,
 * description and active switch don't change which times match, so they are fixed: an unnamed
 * draft still previews, and typing the name doesn't refetch.
 */
export function previewInput(values: OfferFormValues, days = PREVIEW_DAYS): OfferPreviewInput | null {
  const parsed = offerFormSchema.safeParse({ ...values, name: PREVIEW_NAME, description: "", active: true });
  if (!parsed.success) return null;
  return { offer: formToInput(parsed.data), days };
}

/** `schedule.timeWindows[0].end` → `schedule.timeWindows.0.end`; per-day errors go to the day picker. */
export function toFormPath(apiPath: string): string {
  const path = apiPath.replace(/\[(\d+)\]/g, ".$1");
  return path.startsWith("schedule.daysOfWeek.") ? "schedule.daysOfWeek" : path;
}

/** The same error with field paths the offer form understands (pass the result to `applyApiErrors`). */
export function withOfferFormPaths(err: unknown): unknown {
  if (!isApiError(err)) return err;
  const fields: Record<string, string> = {};
  for (const [path, message] of Object.entries(err.fields)) {
    const key = toFormPath(path);
    fields[key] ??= message;
  }
  return new ApiError(err.status, err.code, err.message, fields);
}
