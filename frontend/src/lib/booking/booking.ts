/** Facts about a booking a customer sees: its length, what is still due, where it is. Pure. */
import type { Address, CustomerBooking } from "@/lib/api/types";

const MINUTE_MS = 60_000;

/** Length in minutes between two ISO instants (a booking's start and end). */
export function bookingMinutes(b: Pick<CustomerBooking, "start" | "end">): number {
  return Math.round((new Date(b.end).getTime() - new Date(b.start).getTime()) / MINUTE_MS);
}

/** The ISO instant `minutes` after `start` (where a booking of that length ends). */
export function bookingEnd(start: string, minutes: number): string {
  return new Date(new Date(start).getTime() + minutes * MINUTE_MS).toISOString();
}

/** Whether the booking's end is before `now`. */
export function hasEnded(b: Pick<CustomerBooking, "end">, now: Date): boolean {
  return new Date(b.end).getTime() < now.getTime();
}

/**
 * What is still to pay online to confirm a booking held for payment: the deposit (or the price) less what
 * has been paid. Never negative.
 */
export function amountDueCents(
  b: Pick<CustomerBooking, "depositCents" | "priceCents" | "amountPaidCents">,
): number {
  return Math.max(0, (b.depositCents ?? b.priceCents) - b.amountPaidCents);
}

/**
 * What is left to pay at the appointment once a deposit is paid: the price less what was paid. Null unless the
 * booking takes a deposit, is paid, and that payment is less than the price (paid in full, at the venue, or
 * refunded: nothing is said).
 */
export function balanceDueCents(
  b: Pick<CustomerBooking, "paymentStatus" | "depositCents" | "priceCents" | "amountPaidCents">,
): number | null {
  if (b.paymentStatus !== "paid" || b.depositCents == null) return null;
  if (b.amountPaidCents <= 0 || b.amountPaidCents >= b.priceCents) return null;
  return b.priceCents - b.amountPaidCents;
}

/**
 * Whether a payment badge says something next to the status badge: not when no payment is involved, and not
 * while held (the status already says "Awaiting payment") or once expired (the backend leaves the unpaid charge
 * `pending`, but nothing will be charged).
 */
export function showsPaymentStatus(b: Pick<CustomerBooking, "status" | "paymentStatus">): boolean {
  return b.paymentStatus !== "not_required" && b.status !== "held" && b.status !== "expired";
}

/** "Unit 4, Lantern Quay, Dublin, D02 X285": every line that is set. */
export function formatAddress(a: Address): string {
  return [a.line1, a.line2, a.city, a.postcode].filter(Boolean).join(", ");
}

/** "Unit 4, Lantern Quay, Dublin": first line and city, for compact places. */
export function shortAddress(a: Pick<Address, "line1" | "city">): string {
  return [a.line1, a.city].filter(Boolean).join(", ");
}

/**
 * Bookings in time order: soonest first for upcoming, most recent first for past. By instant, not text: each
 * start carries its business's offset, and businesses (or the two sides of a clock change) differ.
 */
export function sortByStart<B extends Pick<CustomerBooking, "start">>(
  bookings: B[],
  order: "upcoming" | "past",
): B[] {
  const sign = order === "upcoming" ? 1 : -1;
  return [...bookings].sort((a, b) => sign * (Date.parse(a.start) - Date.parse(b.start)));
}

/** The distinct businesses in these bookings, in order, at most `limit` ("Book again with"). */
export function businessesIn(bookings: CustomerBooking[], limit: number): CustomerBooking["business"][] {
  const seen = new Map<string, CustomerBooking["business"]>();
  for (const b of bookings) if (!seen.has(b.business.slug)) seen.set(b.business.slug, b.business);
  return [...seen.values()].slice(0, limit);
}
