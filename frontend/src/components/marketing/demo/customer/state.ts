/** The customer demo's world: one visitor booking an initial assessment at Lumen Physiotherapy on a phone, from its booking link. */
import { addDaysToPlainDate, isoWeekday, startOfIsoWeek, type PlainDate } from "@/lib/format";

export type Screen =
  "service" | "therapist" | "time" | "details" | "review" | "checkout" | "confirmed" | "my-bookings";

/**
 * Lumen's timezone (the fixture's `LUMEN.timezone`). Here so the demo's first-load code can find today without
 * pulling in the fixture, which only the replica's own chunk needs.
 */
export const LUMEN_TIMEZONE = "Europe/Dublin";

export type Details = { name: string; email: string; phone: string; help: string; surgery: string | null };

export type CustomerState = {
  /** The demo's "today" (a Thursday, see `demoToday`): every date on screen follows from it. */
  today: PlainDate;
  screen: Screen;
  /** Scroll offset of the page inside the phone, in CSS pixels. */
  scrollY: number;
  /** Time step: the week strip shows the week after today's. */
  nextWeek: boolean;
  date: PlainDate | null;
  time: string | null;
  details: Details;
  /** The "surgery in the last 12 months" select is open. */
  selectOpen: boolean;
  /** "Taking you to secure payment…" over the review step. */
  redirecting: boolean;
  /** Checkout: the card was filled from the phone's saved cards. */
  cardFilled: boolean;
  paying: boolean;
  calendarMenu: boolean;
  /** My bookings: the Past tab is selected. */
  pastTab: boolean;
};

/** The booking: an initial assessment with Sam Rivers. */
export const SERVICE_ID = "604bdd21-f40a-4570-8f06-0d43056bd60f";
export const SAM_ID = "429b9ed1-58de-4c15-ac08-820e3cb78d1d";
export const BOOKED_TIME = "12:30";

/** Sam's real availability in the seed: Fridays are nearly full, Tuesdays are open over lunch. */
const SLOTS_BY_WEEKDAY: Record<number, string[]> = {
  1: ["10:00", "10:30", "11:00", "15:00", "15:30"],
  2: ["11:30", "12:00", "12:30", "13:00", "13:30", "14:00", "14:30"],
  3: ["09:00", "09:30", "10:00", "16:00"],
  4: ["11:00", "11:30", "12:00"],
  5: ["11:00", "11:30"],
};

/** Bookable times on a day: weekdays after today (minimum notice rules today out). */
export function slotsOn(date: PlainDate, today: PlainDate): string[] {
  if (date <= today) return [];
  return SLOTS_BY_WEEKDAY[isoWeekday(date)] ?? [];
}

/**
 * The days the script uses: the flow opens on the first bookable day (tomorrow, a Friday), and the visitor
 * moves to the next week and picks its Tuesday.
 */
export function demoDates(today: PlainDate) {
  const week = startOfIsoWeek(today);
  return {
    firstOpen: addDaysToPlainDate(today, 1),
    thisWeek: week,
    nextWeek: addDaysToPlainDate(week, 7),
    booked: addDaysToPlainDate(week, 8),
  };
}

/**
 * The demo always shows a Thursday as today (the next one on or after the real date), so the script's days
 * (Friday, next week's Tuesday) are in the future and line up the same way every week.
 */
export function demoToday(realToday: PlainDate): PlainDate {
  const shift = (4 - isoWeekday(realToday) + 7) % 7;
  return addDaysToPlainDate(realToday, shift);
}

export const EMPTY_DETAILS: Details = { name: "", email: "", phone: "", help: "", surgery: null };

export const JORDAN: Details = {
  name: "Jordan Pike",
  email: "jordan@example.com",
  phone: "087 123 4567",
  help: "Sore knee after running, mostly on downhills.",
  surgery: "No",
};

export function initialState(today: PlainDate, screen: Screen): CustomerState {
  return {
    today,
    screen,
    scrollY: 0,
    nextWeek: false,
    date: null,
    time: null,
    details: EMPTY_DETAILS,
    selectOpen: false,
    redirecting: false,
    cardFilled: false,
    paying: false,
    calendarMenu: false,
    pastTab: false,
  };
}

/** Everything chosen up to the details step. */
export function bookedState(today: PlainDate, screen: Screen, details: Details = JORDAN): CustomerState {
  const d = demoDates(today);
  return { ...initialState(today, screen), nextWeek: true, date: d.booked, time: BOOKED_TIME, details };
}

/** The page's address, for the Safari bar (and the stage's `url`). */
export function urlFor(s: CustomerState): string {
  switch (s.screen) {
    case "checkout":
      return "checkout.stripe.com";
    case "confirmed":
      return "bookanything.ie/manage";
    case "my-bookings":
      return "bookanything.ie/my/bookings";
    default:
      return "bookanything.ie/lumen-physio/book";
  }
}
