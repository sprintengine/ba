import { describe, expect, it } from "vitest";
import type { BookingStatus } from "@/lib/api/types";
import { BOOKING_STATUS, PAYMENT_STATUS, isBlockingStatus, isReleasedStatus } from "./status";

const ALL = Object.keys(BOOKING_STATUS) as BookingStatus[];

describe("booking status predicates", () => {
  it("blocking: the time is taken (held, awaiting approval, confirmed)", () => {
    expect(ALL.filter(isBlockingStatus)).toEqual(["held", "pending_approval", "confirmed"]);
  });

  it("released: the time was given back without the appointment (cancelled, expired)", () => {
    expect(ALL.filter(isReleasedStatus)).toEqual(["cancelled", "expired"]);
  });
});

describe("payment status copy", () => {
  it("says pay at venue is still to be paid (staff record it once taken)", () => {
    expect(PAYMENT_STATUS.pay_at_venue.description).toBe("To be paid in person at the appointment.");
  });
});
