import { describe, expect, it } from "vitest";
import { managedBooking } from "./__tests__/fixtures";
import {
  amountDueCents,
  balanceDueCents,
  bookingEnd,
  bookingMinutes,
  businessesIn,
  sortByStart,
  formatAddress,
  hasEnded,
  shortAddress,
  showsPaymentStatus,
} from "./booking";

describe("booking facts", () => {
  it("measures and extends bookings in minutes", () => {
    expect(bookingMinutes({ start: "2026-10-05T09:00:00Z", end: "2026-10-05T10:15:00Z" })).toBe(75);
    expect(bookingEnd("2026-10-05T09:00:00Z", 75)).toBe("2026-10-05T10:15:00.000Z");
  });

  it("knows when a booking has ended", () => {
    const b = { end: "2026-10-05T10:00:00Z" };
    expect(hasEnded(b, new Date("2026-10-05T10:00:01Z"))).toBe(true);
    expect(hasEnded(b, new Date("2026-10-05T10:00:00Z"))).toBe(false);
  });

  it("owes the deposit (or the price) less what was paid, never less than nothing", () => {
    expect(amountDueCents({ depositCents: 2000, priceCents: 7000, amountPaidCents: 0 })).toBe(2000);
    expect(amountDueCents({ depositCents: null, priceCents: 7000, amountPaidCents: 0 })).toBe(7000);
    expect(amountDueCents({ depositCents: null, priceCents: 7000, amountPaidCents: 2000 })).toBe(5000);
    expect(amountDueCents({ depositCents: 2000, priceCents: 7000, amountPaidCents: 7000 })).toBe(0);
  });

  it("leaves the rest of the price due at the appointment once a deposit is paid", () => {
    const deposit = { paymentStatus: "paid", depositCents: 2000, priceCents: 7000 } as const;
    expect(balanceDueCents({ ...deposit, amountPaidCents: 2000 })).toBe(5000);
    // Paid in full (online, or the rest in person): nothing left.
    expect(balanceDueCents({ ...deposit, amountPaidCents: 7000 })).toBeNull();
    // No deposit, not paid, or refunded: not a deposit balance.
    expect(balanceDueCents({ ...deposit, depositCents: null, amountPaidCents: 2000 })).toBeNull();
    expect(balanceDueCents({ ...deposit, paymentStatus: "pending", amountPaidCents: 0 })).toBeNull();
    expect(balanceDueCents({ ...deposit, paymentStatus: "refunded", amountPaidCents: 2000 })).toBeNull();
  });

  it("shows the payment status only when it adds something", () => {
    expect(showsPaymentStatus({ status: "confirmed", paymentStatus: "paid" })).toBe(true);
    expect(showsPaymentStatus({ status: "cancelled", paymentStatus: "refunded" })).toBe(true);
    expect(showsPaymentStatus({ status: "confirmed", paymentStatus: "not_required" })).toBe(false);
    expect(showsPaymentStatus({ status: "held", paymentStatus: "pending" })).toBe(false);
    // An expired hold keeps its unpaid charge "pending" in the backend: nothing will be charged.
    expect(showsPaymentStatus({ status: "expired", paymentStatus: "pending" })).toBe(false);
  });

  it("formats addresses, skipping empty lines", () => {
    const a = { line1: "Unit 4, Lantern Quay", line2: null, city: "Dublin", postcode: "D02 X285" };
    expect(formatAddress(a)).toBe("Unit 4, Lantern Quay, Dublin, D02 X285");
    expect(shortAddress(a)).toBe("Unit 4, Lantern Quay, Dublin");
    expect(formatAddress({ line1: null, line2: null, city: null, postcode: null })).toBe("");
  });

  it("orders upcoming soonest first and past most recent first", () => {
    const a = { start: "2026-10-05T09:00:00Z" };
    const b = { start: "2026-10-07T09:00:00Z" };
    expect(sortByStart([b, a], "upcoming")).toEqual([a, b]);
    expect(sortByStart([a, b], "past")).toEqual([b, a]);
  });

  it("orders bookings with businesses in different timezones by the instant", () => {
    // 10:30 in Berlin (08:30 UTC) is before 10:00 in Dublin (09:00 UTC).
    const berlin = managedBooking({ id: "berlin", start: "2026-10-08T10:30:00+02:00" });
    const dublin = managedBooking({ id: "dublin", start: "2026-10-08T10:00:00+01:00" });
    expect(sortByStart([dublin, berlin], "upcoming").map((x) => x.id)).toEqual(["berlin", "dublin"]);
    expect(sortByStart([berlin, dublin], "past").map((x) => x.id)).toEqual(["dublin", "berlin"]);
  });

  it("lists each business once, up to a limit", () => {
    const lumen = managedBooking();
    const other = managedBooking({ business: { ...lumen.business, slug: "other", name: "Other" } });
    expect(businessesIn([lumen, other, lumen], 4).map((x) => x.slug)).toEqual(["lumen-physio", "other"]);
    expect(businessesIn([lumen, other], 1)).toHaveLength(1);
  });
});
