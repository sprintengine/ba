import type { CalendarMode } from "@/lib/dashboard/calendar";

/** How tall an hour is drawn. Time is always to scale; this only chooses the scale. */
export type CalendarZoom = "comfortable" | "compact" | "fit";

export const CALENDAR_ZOOMS: { value: CalendarZoom; label: string; hint: string }[] = [
  { value: "comfortable", label: "Comfortable", hint: "Room for every detail" },
  { value: "compact", label: "Compact", hint: "About twice as many hours" },
  { value: "fit", label: "Fit the day", hint: "The working day in this window" },
];

/**
 * A day reads bookings at length; a week is tall enough that half an hour still fits who, when and what on three
 * lines. Compact is the same grid at about half the height.
 */
const SCALES: Record<Exclude<CalendarZoom, "fit">, Record<CalendarMode, number>> = {
  comfortable: { day: 200, week: 124 },
  compact: { day: 100, week: 72 },
};

/** The shortest card that still holds a line of text. */
const MIN_CARD_PX = 14;
/** However long the bookings, an hour stays tall enough to read the grid. */
const MIN_HOUR_PX = 36;

/** The smallest scale at which the day's shortest booking keeps its line of text. */
export const readableHourPx = (shortestMinutes: number) =>
  Math.max(MIN_HOUR_PX, Math.ceil((MIN_CARD_PX * 60) / Math.max(shortestMinutes, 1)));

/**
 * The to-scale height that fits `hours` into `available` pixels. It stops where the shortest booking would lose its
 * text, and from there the grid scrolls; it never grows past Comfortable.
 */
export const fitHourPx = (view: CalendarMode, available: number, hours: number, shortestMinutes = 15) =>
  hours > 0 && available > 0
    ? Math.min(
        SCALES.comfortable[view],
        Math.max(readableHourPx(shortestMinutes), Math.floor(available / hours)),
      )
    : SCALES.comfortable[view];

export const hourPx = (
  view: CalendarMode,
  zoom: CalendarZoom = "comfortable",
  fit?: { available: number; hours: number; shortestMinutes?: number },
) =>
  zoom === "fit"
    ? fitHourPx(view, fit?.available ?? 0, fit?.hours ?? 0, fit?.shortestMinutes)
    : SCALES[zoom][view];
