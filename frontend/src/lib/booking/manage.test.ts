import { describe, expect, it } from "vitest";
import { afterEach, beforeEach, vi } from "vitest";
import { managedBooking } from "./__tests__/fixtures";
import { manageContextFrom, manageHero, manageHeroText, checkoutSessionFrom } from "./manage";

describe("manage page states", () => {
  it("celebrates a fresh or paid booking, stays quiet on a revisit", () => {
    const b = managedBooking();
    expect(manageHero(b, "booked", null)).toMatchObject({ kind: "confirmed", title: "You're booked" });
    expect(manageHero(b, "paid", null)).toMatchObject({ kind: "confirmed" });
    expect(manageHero(b, null, null)).toEqual({ kind: "none" });
  });

  it("handles held bookings: waiting for the webhook, pay now, or run out", () => {
    const held = managedBooking({ status: "held", paymentStatus: "pending" });
    expect(manageHero(held, "paid", 60_000).kind).toBe("confirming_payment");
    expect(manageHero(held, "payment_cancelled", 60_000)).toMatchObject({
      kind: "awaiting_payment",
      title: "Payment not completed",
    });
    expect(manageHero(held, null, 60_000)).toMatchObject({
      kind: "awaiting_payment",
      title: "Complete your payment",
    });
    expect(manageHero(held, null, 0).kind).toBe("expired");
  });

  it("covers requests, cancellations and past bookings", () => {
    expect(manageHero(managedBooking({ status: "pending_approval" }), "booked", null).kind).toBe(
      "pending_approval",
    );
    expect(manageHero(managedBooking({ status: "pending_approval" }), "paid", null)).toMatchObject({
      title: "Payment received and request sent",
    });
    expect(manageHero(managedBooking({ status: "cancelled" }), null, null).kind).toBe("cancelled");
    expect(manageHero(managedBooking({ status: "expired" }), null, null).kind).toBe("expired");
    expect(manageHero(managedBooking({ status: "completed" }), null, null).kind).toBe("past");
    expect(manageHero(managedBooking({ status: "no_show" }), null, null).kind).toBe("past");
  });

  it("reads how the visitor arrived from the URL", () => {
    expect(manageContextFrom(new URLSearchParams("payment=succeeded&booked=1"))).toBe("paid");
    expect(manageContextFrom(new URLSearchParams("payment=cancelled"))).toBe("payment_cancelled");
    expect(manageContextFrom(new URLSearchParams("booked=1"))).toBe("booked");
    expect(manageContextFrom(new URLSearchParams(""))).toBeNull();
  });
});

describe("manage hero text", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-05T08:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());
  const opts = { noun: "appointment", knowsBusiness: true };

  it("confirms where the details went and when to come", () => {
    expect(manageHeroText("confirmed", managedBooking(), opts)).toBe(
      "We've emailed the details to alex.morgan@example.com. See you on Thursday, 8 October.",
    );
    const noEmail = managedBooking({ customer: { name: "A", email: null, phone: null } });
    expect(manageHeroText("confirmed", noEmail, opts)).toBe("See you on Thursday, 8 October.");
    expect(manageHeroText("pending_approval", noEmail, opts)).toMatch(/We'll email you as soon/);
  });

  it("explains refunds after a cancellation", () => {
    expect(manageHeroText("cancelled", managedBooking({ amountRefundedCents: 7000 }), opts)).toMatch(
      /^€70 is on its way back to your card/,
    );
    expect(manageHeroText("cancelled", managedBooking(), opts)).toBe(
      "This appointment was cancelled and the time released.",
    );
  });

  it("thanks past customers once the business is known", () => {
    expect(manageHeroText("past", managedBooking(), opts)).toBe(
      "Thanks for booking with Lumen Physiotherapy.",
    );
    expect(manageHeroText("past", managedBooking(), { ...opts, knowsBusiness: false })).toBeNull();
    expect(manageHeroText("expired", managedBooking(), opts)).toMatch(/Nothing was charged/);
    expect(manageHeroText("confirming_payment", managedBooking(), opts)).toMatch(/few seconds/);
  });
});

describe("back from Checkout", () => {
  it("reads the session Stripe sent back, and only a Checkout Session", () => {
    expect(checkoutSessionFrom(new URLSearchParams("payment=succeeded&session_id=cs_test_1"))).toBe(
      "cs_test_1",
    );
    expect(checkoutSessionFrom(new URLSearchParams("session_id={CHECKOUT_SESSION_ID}"))).toBeNull();
    expect(checkoutSessionFrom(new URLSearchParams(""))).toBeNull();
  });

  it("says it is taking longer once the wait is over", () => {
    const held = { status: "held" as const };
    expect(manageHero(held, "paid", 60_000).kind).toBe("confirming_payment");
    expect(manageHero(held, "paid", 60_000, true)).toEqual({
      kind: "still_confirming",
      title: "Still confirming your payment",
      tone: "info",
    });
    // Only for a payment being confirmed.
    expect(manageHero(held, null, 60_000, true).kind).toBe("awaiting_payment");
  });
});
