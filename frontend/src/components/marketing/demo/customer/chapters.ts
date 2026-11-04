import type { PlainDate } from "@/lib/format";
import type { DemoChapter } from "../engine/types";
import {
  BOOKED_TIME,
  bookedState,
  demoDates,
  EMPTY_DETAILS,
  initialState,
  JORDAN,
  SERVICE_ID,
  urlFor,
  type CustomerState,
} from "./state";

type Chapter = DemoChapter<CustomerState>;

/** Scroll the page and let the flick settle before the next tap. */
const scroll = (y: number, settle = 750) =>
  [
    { kind: "set", apply: (s: CustomerState) => ({ ...s, scrollY: y }) },
    { kind: "wait", ms: settle },
  ] as const;

function findAPhysio(today: PlainDate): Chapter {
  return {
    id: "find",
    label: "Open the link",
    caption:
      "A visitor taps Lumen Physiotherapy's booking link, sees the current deal and chooses an initial assessment.",
    url: urlFor,
    initial: initialState(today, "service"),
    steps: [
      { kind: "wait", ms: 1400 },
      ...scroll(260, 1500),
      {
        kind: "click",
        target: `service-${SERVICE_ID}`,
        apply: (s) => ({ ...s, screen: "therapist", scrollY: 0 }),
      },
      { kind: "wait", ms: 300 },
    ],
  };
}

function pickATime(today: PlainDate): Chapter {
  const d = demoDates(today);
  return {
    id: "time",
    label: "Pick a time",
    caption: "They choose their therapist, move to next week and pick Tuesday at 12:30.",
    url: urlFor,
    initial: initialState(today, "therapist"),
    steps: [
      { kind: "click", target: "therapist-sam", apply: (s) => ({ ...s, screen: "time", date: d.firstOpen }) },
      { kind: "wait", ms: 600 },
      { kind: "click", target: "week-next", apply: (s) => ({ ...s, nextWeek: true }) },
      { kind: "click", target: `day-${d.booked}`, apply: (s) => ({ ...s, date: d.booked }) },
      { kind: "wait", ms: 300 },
      { kind: "click", target: `slot-${BOOKED_TIME}`, apply: (s) => ({ ...s, time: BOOKED_TIME }) },
      { kind: "wait", ms: 400 },
    ],
  };
}

function yourDetails(today: PlainDate): Chapter {
  const type = (target: string, field: "name" | "email" | "phone" | "help", text: string, cps: number) =>
    ({
      kind: "type",
      target,
      text,
      cps,
      apply: (s: CustomerState, typed: string) => ({ ...s, details: { ...s.details, [field]: typed } }),
    }) as const;
  return {
    id: "details",
    label: "Your details",
    caption:
      "They add their name, email and phone, say what they'd like help with and answer the intake question.",
    url: urlFor,
    initial: bookedState(today, "details", EMPTY_DETAILS),
    steps: [
      type("field-name", "name", JORDAN.name, 15),
      type("field-email", "email", JORDAN.email, 24),
      type("field-phone", "phone", JORDAN.phone, 18),
      ...scroll(330),
      type("field-help", "help", JORDAN.help, 30),
      { kind: "click", target: "field-surgery", apply: (s) => ({ ...s, selectOpen: true }) },
      {
        kind: "click",
        target: "field-surgery-no",
        apply: (s) => ({ ...s, selectOpen: false, details: { ...s.details, surgery: "No" } }),
      },
      { kind: "wait", ms: 200 },
    ],
  };
}

function payAndDone(today: PlainDate): Chapter {
  return {
    id: "pay",
    label: "Pay & done",
    caption:
      "They review the appointment, pay €70 by card and are booked, with a one-tap add to their calendar.",
    url: urlFor,
    initial: { ...bookedState(today, "details"), scrollY: 330 },
    steps: [
      { kind: "click", target: "review", apply: (s) => ({ ...s, screen: "review", scrollY: 0 }) },
      { kind: "wait", ms: 300 },
      ...scroll(390, 750),
      { kind: "click", target: "continue-to-payment", apply: (s) => ({ ...s, redirecting: true }) },
      { kind: "wait", ms: 800 },
      { kind: "set", apply: (s) => ({ ...s, screen: "checkout", redirecting: false, scrollY: 0 }) },
      { kind: "wait", ms: 500 },
      ...scroll(300, 700),
      { kind: "click", target: "card-number", apply: (s) => ({ ...s, cardFilled: true }) },
      { kind: "click", target: "pay", apply: (s) => ({ ...s, paying: true }) },
      { kind: "wait", ms: 800 },
      { kind: "set", apply: (s) => ({ ...s, screen: "confirmed", paying: false, scrollY: 0 }) },
      { kind: "wait", ms: 1000 },
      ...scroll(250, 700),
      { kind: "click", target: "add-to-calendar", apply: (s) => ({ ...s, calendarMenu: true }) },
      { kind: "wait", ms: 1100 },
    ],
  };
}

function myBookings(today: PlainDate): Chapter {
  return {
    id: "my-bookings",
    label: "My bookings",
    caption: "With an account, the appointment sits in My bookings beside everything else they've booked.",
    url: urlFor,
    initial: { ...initialState(today, "my-bookings"), details: JORDAN },
    steps: [
      { kind: "wait", ms: 1000 },
      ...scroll(330, 1400),
      ...scroll(0, 800),
      { kind: "click", target: "tab-past", apply: (s) => ({ ...s, pastTab: true }) },
      { kind: "wait", ms: 1500 },
    ],
  };
}

/** The visitor's journey, dated from the demo's today. */
export function customerChapters(today: PlainDate): readonly [Chapter, ...Chapter[]] {
  return [findAPhysio(today), pickATime(today), yourDetails(today), payAndDone(today), myBookings(today)];
}
