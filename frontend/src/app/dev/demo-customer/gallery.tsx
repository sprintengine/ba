"use client";

import { PhoneChrome } from "@/components/marketing/demo/engine/frames";
import { PhoneScreen } from "@/components/marketing/demo/customer/phone-screen";
import {
  bookedState,
  demoDates,
  EMPTY_DETAILS,
  initialState,
  JORDAN,
  type CustomerState,
} from "@/components/marketing/demo/customer/state";

const TODAY = "2026-10-01";
const d = demoDates(TODAY);

/** Every screen of the customer demo in a fixed state, for side-by-side checks against the real pages. */
const STATES: [string, CustomerState][] = [
  ["service", initialState(TODAY, "service")],
  ["service-scrolled", { ...initialState(TODAY, "service"), scrollY: 260 }],
  ["therapist", initialState(TODAY, "therapist")],
  ["time-fri", { ...initialState(TODAY, "time"), date: d.firstOpen }],
  ["time-tue", { ...initialState(TODAY, "time"), nextWeek: true, date: d.booked }],
  ["details-empty", bookedState(TODAY, "details", EMPTY_DETAILS)],
  [
    "details-select",
    { ...bookedState(TODAY, "details", { ...JORDAN, surgery: null }), scrollY: 330, selectOpen: true },
  ],
  ["review", bookedState(TODAY, "review")],
  ["review-bottom", { ...bookedState(TODAY, "review"), scrollY: 390 }],
  ["redirecting", { ...bookedState(TODAY, "review"), scrollY: 390, redirecting: true }],
  ["checkout", bookedState(TODAY, "checkout")],
  ["checkout-filled", { ...bookedState(TODAY, "checkout"), scrollY: 300, cardFilled: true }],
  ["confirmed", bookedState(TODAY, "confirmed")],
  ["confirmed-menu", { ...bookedState(TODAY, "confirmed"), scrollY: 250, calendarMenu: true }],
  ["my-bookings", initialState(TODAY, "my-bookings")],
];

export function Gallery() {
  return (
    <div className="flex flex-wrap gap-8">
      {STATES.map(([id, s]) => (
        <div key={id} data-gallery={id} className="w-fit">
          <PhoneChrome width={390} height={844}>
            <PhoneScreen s={s} />
          </PhoneChrome>
        </div>
      ))}
    </div>
  );
}
