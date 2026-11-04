/** Pure helpers for My bookings (tested in my-bookings.test.ts). */
import type { CustomerBooking, MyBookings } from "@shared/api/types";
import { sortByStart } from "@shared/booking/booking";
import { isReleasedStatus } from "@shared/status";

export type BookingsTab = "upcoming" | "past";

/** The tab's bookings in time order: soonest first for upcoming, most recent first for past. */
export function bookingsFor(data: MyBookings, tab: BookingsTab): CustomerBooking[] {
  return sortByStart(tab === "upcoming" ? data.upcoming : data.past, tab);
}

/** One of my bookings by id, from either list. There is no single-booking endpoint for customers (§6.2). */
export function findMyBooking(data: MyBookings | undefined, id: string): CustomerBooking | undefined {
  return data?.upcoming.find((b) => b.id === id) ?? data?.past.find((b) => b.id === id);
}

/** Past, cancelled or expired: shown faded, without what's left to pay. */
export function isInactive(booking: CustomerBooking, tab: BookingsTab): boolean {
  return tab === "past" || isReleasedStatus(booking.status);
}

/** Which list a booking is in. */
export function tabOf(data: MyBookings | undefined, id: string): BookingsTab {
  return data?.past.some((b) => b.id === id) ? "past" : "upcoming";
}
