/** Booking API errors: what kind they are and where field errors belong. Pure. */
import { errorMessage, isApiError, type ApiError } from "@/lib/api/client";

export type BookingErrorKind =
  | "slot_taken"
  | "price_changed"
  | "plan_limit"
  | "rate_limited"
  | "payments"
  | "fields"
  | "policy"
  | "unavailable"
  | "other";

/** The chosen time was taken by someone else meanwhile: refresh the times and let the customer pick again. */
export function isSlotUnavailable(err: unknown): boolean {
  return isApiError(err) && err.code === "SLOT_UNAVAILABLE";
}

export function classifyBookingError(err: unknown): BookingErrorKind {
  const e = err as Partial<ApiError> | null;
  if (!e || typeof e !== "object") return "other";
  switch (e.code) {
    case "SLOT_UNAVAILABLE":
      return "slot_taken";
    case "PRICE_CHANGED":
      return "price_changed";
    case "PLAN_LIMIT_REACHED":
      return "plan_limit";
    case "RATE_LIMITED":
      return "rate_limited";
    case "PAYMENTS_NOT_CONFIGURED":
      return "payments";
    case "POLICY_VIOLATION":
      return "policy";
    case "NETWORK_ERROR":
    case "SERVICE_UNAVAILABLE":
    case "DATABASE_UNAVAILABLE":
      return "unavailable";
    case "INVALID_REQUEST":
      return e.fields && Object.keys(e.fields).length > 0 ? "fields" : "other";
    default:
      return e.status === 409 && e.code === "CONFLICT" ? "slot_taken" : "other";
  }
}

/** Maps API field paths (`customer.email`, `answers.<id>`) onto details-form field names. */
export function mapBookingFieldErrors(fields: Record<string, string>): {
  form: Record<string, string>;
  /** Errors that belong to earlier steps (service/option/time…). */
  other: Record<string, string>;
} {
  const form: Record<string, string> = {};
  const other: Record<string, string> = {};
  for (const [key, message] of Object.entries(fields)) {
    const name = FORM_FIELDS.get(key) ?? (key.startsWith("answers.") ? key : null);
    if (name) form[name] = message;
    else other[key] = message;
  }
  return { form, other };
}

const FORM_FIELDS = new Map([
  ["customer.name", "name"],
  ["customer.email", "email"],
  ["customer.phone", "phone"],
  ["customerNotes", "notes"],
]);

/** A message above the review step's summary. */
export type BookingAlert = { tone: "danger" | "warning"; title: string; body: string };

/**
 * What to tell the customer when booking failed for a reason the flow doesn't handle in place (a taken time
 * goes back to the time step; field errors go to the details form). `contact` is the business's phone and/or
 * email ("" when it has neither); `bookingsNoun` is the business's word for bookings; `payAtVenueOffered` is
 * whether the customer could choose to pay at the venue instead (and hasn't).
 */
export function bookingErrorAlert(
  err: unknown,
  ctx: { businessName: string; contact: string; bookingsNoun: string; payAtVenueOffered?: boolean },
): BookingAlert {
  const message = errorMessage(err);
  switch (classifyBookingError(err)) {
    case "fields": {
      const { other } = mapBookingFieldErrors(isApiError(err) ? err.fields : {});
      const body = Object.values(other)[0] ?? message;
      return { tone: "danger", title: "Something in your selection needs another look", body };
    }
    case "plan_limit":
      return {
        tone: "danger",
        title: `${ctx.businessName} can't take more online ${ctx.bookingsNoun} right now`,
        body: ctx.contact
          ? `Please get in touch directly: ${ctx.contact}.`
          : "Please get in touch with them directly.",
      };
    case "rate_limited":
      return { tone: "warning", title: "Too many attempts", body: "Please wait a minute, then try again." };
    case "price_changed":
      // The message names the new price; the summary shows it once the times are refreshed.
      return {
        tone: "warning",
        title: "The price has changed",
        body: `${message} Nothing has been booked yet.`,
      };
    case "payments":
      return {
        tone: "danger",
        title: "Online payment isn't available right now",
        body: ctx.payAtVenueOffered
          ? `${ctx.businessName} can't take payments online at the moment. Choose “Pay at the venue” under Payment to book now and pay at your appointment.`
          : ctx.contact
            ? `${ctx.businessName} can't take payments online at the moment. Please contact them: ${ctx.contact}.`
            : `${ctx.businessName} can't take payments online at the moment. Please contact them directly.`,
      };
    case "unavailable":
      return {
        tone: "warning",
        title: "We couldn't reach the booking system",
        body: "Nothing was booked. Check your connection and try again — it's safe to retry.",
      };
    case "slot_taken":
    case "policy":
    case "other":
      return { tone: "danger", title: "We couldn't complete your booking", body: message };
  }
}
