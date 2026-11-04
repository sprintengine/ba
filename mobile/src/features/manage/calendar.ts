/**
 * "Add to calendar" through the system's own new-event screen (EventKit's editor on iOS, the calendar app's on
 * Android): the person sees the event and picks the calendar, and the app needs no access to their calendars (iOS
 * 17+). The website offers an .ics file and a Google link instead (`lib/booking/calendar-links.ts`, web-only).
 */
import type { CustomerBooking } from "@shared/api/types";
import { formatAddress } from "@shared/booking/booking";
import { logError } from "~/lib/logger";

export type CalendarEvent = {
  title: string;
  startDate: Date;
  endDate: Date;
  location: string | null;
  notes: string;
  url: string | null;
};

/** The calendar event for a customer's booking, linking back to its manage page when known (the website's event). */
export function bookingCalendarEvent(booking: CustomerBooking, manageUrl?: string | null): CalendarEvent {
  const location = formatAddress(booking.business.address);
  const people = booking.resources.filter((r) => r.kind === "person").map((r) => r.name);
  return {
    title: `${booking.service.name} · ${booking.business.name}`,
    startDate: new Date(booking.start),
    endDate: new Date(booking.end),
    location: location || null,
    notes: [
      `Reference ${booking.reference}`,
      people.length ? `With ${people.join(", ")}` : null,
      manageUrl ? `Manage: ${manageUrl}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    url: manageUrl ?? null,
  };
}

/** iOS says whether the event was saved; Android only that its calendar app was opened (`done`). */
export type AddToCalendarResult = "saved" | "done" | "canceled" | "failed";

function resultOf(action: string): AddToCalendarResult {
  if (action === "saved") return "saved";
  if (action === "done") return "done";
  return "canceled";
}

/** Opens the system's new-event screen with the booking filled in. */
export async function addToCalendar(
  booking: CustomerBooking,
  manageUrl?: string | null,
): Promise<AddToCalendarResult> {
  // Loaded when used (README "Performance rules").
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Calendar = require("expo-calendar/legacy") as typeof import("expo-calendar/legacy");
  const event = bookingCalendarEvent(booking, manageUrl);
  const details = {
    title: event.title,
    startDate: event.startDate,
    endDate: event.endDate,
    location: event.location ?? undefined,
    notes: event.notes,
    url: event.url ?? undefined,
  };
  try {
    return resultOf((await Calendar.createEventInCalendarAsync(details)).action);
  } catch (error) {
    // Before iOS 17 the editor needs calendar access: ask, then try once more.
    try {
      const { granted } = await Calendar.requestCalendarPermissionsAsync();
      if (granted) return resultOf((await Calendar.createEventInCalendarAsync(details)).action);
    } catch (retryError) {
      logError(retryError, { feature: "calendar" });
      return "failed";
    }
    logError(error, { feature: "calendar" });
    return "failed";
  }
}
