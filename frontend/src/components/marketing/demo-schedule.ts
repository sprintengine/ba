import { addDaysToPlainDate, isoWeekday, type PlainDate } from "@/lib/format/datetime";

/**
 * Deterministic fake availability for marketing previews: open Monday–Saturday
 * from tomorrow, a few days fully booked.
 */
export function demoIsOpen(date: PlainDate, today: PlainDate, horizonDays = 45): boolean {
  if (date <= today || date > addDaysToPlainDate(today, horizonDays)) return false;
  if (isoWeekday(date) === 7) return false;
  // Roughly one fully booked day a fortnight.
  return Number(date.slice(8)) % 11 !== 5;
}
