import type { Booking } from "@/lib/api/types";

/** One time on the list: a single booking, or everyone in the same class. */
export type BookingSlot = { key: string; bookings: [Booking, ...Booking[]] };
export type BookingDay = { key: string; first: Booking; slots: BookingSlot[]; count: number; cents: number };

const slotKey = (b: Booking) =>
  [b.start, b.end, b.service.id, b.option?.id ?? "", ...b.resources.map((r) => r.id)].join("|");

const lost = (b: Booking) => b.status === "cancelled" || b.status === "expired";

/**
 * The list as a person reads it: by day, with the people in one class as one row. `dayOf` says which day a booking
 * is on, in the business's time. Keeps the list's order, so a page arriving later only adds to the end.
 */
export function groupBookings(items: Booking[], dayOf: (booking: Booking) => string): BookingDay[] {
  const days = new Map<string, BookingDay>();
  for (const b of items) {
    const key = dayOf(b);
    const day = days.get(key) ?? { key, first: b, slots: [], count: 0, cents: 0 };
    days.set(key, day);
    day.count += 1;
    if (!lost(b)) day.cents += b.priceCents;
    const slot = day.slots.find((s) => s.key === slotKey(b));
    if (slot) slot.bookings.push(b);
    else day.slots.push({ key: slotKey(b), bookings: [b] });
  }
  return [...days.values()];
}
