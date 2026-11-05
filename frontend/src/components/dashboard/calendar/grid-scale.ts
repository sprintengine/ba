import type { CalendarMode } from "@/lib/dashboard/calendar";

/** Vertical scale of the calendar grid: time is always to scale. A day reads bookings; a week reads the shape of it. */
export const hourPx = (view: CalendarMode) => (view === "day" ? 200 : 96);
