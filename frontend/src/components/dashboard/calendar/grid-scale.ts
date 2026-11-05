import type { CalendarMode } from "@/lib/dashboard/calendar";

/**
 * Vertical scale of the calendar grid: time is always to scale. A day reads bookings at length; a week is tall enough
 * that half an hour still fits who, when and what on three lines.
 */
export const hourPx = (view: CalendarMode) => (view === "day" ? 200 : 124);
