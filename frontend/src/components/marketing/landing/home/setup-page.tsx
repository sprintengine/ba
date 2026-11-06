"use client";

import { BookingPhone } from "./booking-phone";
import type { useBookingDemo } from "./use-booking-demo";
import { IPhone } from "./iphone";

const noop = () => undefined;
const FIRST_STEP = { step: "service", pickService: noop, entries: [] } as unknown as ReturnType<
  typeof useBookingDemo
>;

/** The first step of the booking page the draft makes: the real page, held still. */
export function SetupPage() {
  return (
    <IPhone time="15:08">
      <BookingPhone demo={FIRST_STEP} />
    </IPhone>
  );
}
