import { describe, expect, it } from "vitest";
import type { BookingStatus } from "@/lib/api/types";
import { bookingActionLayout, bookingCapabilities, canMarkPaidInPerson } from "./booking-capabilities";

const NOW = new Date("2026-10-01T12:00:00Z");
const FUTURE = "2026-10-01T15:00:00Z";
const PAST = "2026-10-01T09:00:00Z";
const can = (status: BookingStatus, start = FUTURE) => bookingCapabilities({ status, start }, NOW);
const layout = (status: BookingStatus, start = FUTURE) => bookingActionLayout({ status }, can(status, start));

describe("bookingCapabilities", () => {
  it.each([
    ["held", FUTURE, { approve: false, reschedule: false, cancel: true, mark: false }],
    ["pending_approval", FUTURE, { approve: true, reschedule: true, cancel: true, mark: false }],
    ["confirmed", FUTURE, { approve: false, reschedule: true, cancel: true, mark: false }],
    ["confirmed", PAST, { approve: false, reschedule: true, cancel: true, mark: true }],
    ["completed", PAST, { approve: false, reschedule: false, cancel: false, mark: true }],
    ["no_show", PAST, { approve: false, reschedule: false, cancel: false, mark: true }],
    ["cancelled", PAST, { approve: false, reschedule: false, cancel: false, mark: false }],
    ["expired", PAST, { approve: false, reschedule: false, cancel: false, mark: false }],
  ] as const)("%s starting %s", (status, start, expected) => {
    expect(can(status, start)).toEqual(expected);
  });

  it("counts a booking starting right now as started", () => {
    expect(can("confirmed", NOW.toISOString()).mark).toBe(true);
  });
});

describe("bookingActionLayout", () => {
  it("puts approve/decline first and the rest in the menu for pending bookings", () => {
    expect(layout("pending_approval")).toMatchObject({
      idle: null,
      approveDecline: true,
      rescheduleButton: false,
      cancelButton: false,
      overflowMenu: true,
    });
  });

  it("shows reschedule and cancel as buttons before a confirmed booking starts", () => {
    expect(layout("confirmed")).toMatchObject({
      markOutcome: false,
      rescheduleButton: true,
      cancelButton: true,
      overflowMenu: false,
    });
  });

  it("asks how it went once a confirmed booking has started", () => {
    expect(layout("confirmed", PAST)).toMatchObject({
      markOutcome: true,
      correctOutcome: null,
      overflowMenu: true,
    });
  });

  it("offers to correct a recorded outcome", () => {
    expect(layout("completed", PAST)).toMatchObject({ correctOutcome: "no_show", overflowMenu: false });
    expect(layout("no_show", PAST)).toMatchObject({ correctOutcome: "completed" });
  });

  it("only cancels a held booking", () => {
    expect(layout("held")).toMatchObject({
      cancelButton: true,
      rescheduleButton: false,
      overflowMenu: false,
    });
  });

  it("says when there is nothing to do", () => {
    expect(layout("cancelled").idle).toEqual({ closed: true });
    expect(layout("expired").idle).toEqual({ closed: true });
    expect(layout("completed", FUTURE).idle).toEqual({ closed: false });
  });
});

describe("canMarkPaidInPerson", () => {
  const due = {
    status: "confirmed",
    paymentStatus: "pay_at_venue",
    priceCents: 5000,
    amountPaidCents: 0,
  } as const;

  it("is offered while something is due at the venue", () => {
    expect(canMarkPaidInPerson(due)).toBe(true);
    expect(canMarkPaidInPerson({ ...due, status: "completed" })).toBe(true);
    // A deposit paid online, the balance due at the venue.
    expect(canMarkPaidInPerson({ ...due, paymentStatus: "paid", amountPaidCents: 1500 })).toBe(true);
  });

  it("is not offered once paid, for online payments still pending, or for closed bookings", () => {
    expect(canMarkPaidInPerson({ ...due, paymentStatus: "paid", amountPaidCents: 5000 })).toBe(false);
    expect(canMarkPaidInPerson({ ...due, paymentStatus: "pending" })).toBe(false);
    expect(canMarkPaidInPerson({ ...due, paymentStatus: "not_required", priceCents: 0 })).toBe(false);
    expect(canMarkPaidInPerson({ ...due, status: "cancelled" })).toBe(false);
    expect(canMarkPaidInPerson({ ...due, status: "pending_approval" })).toBe(false);
  });
});
