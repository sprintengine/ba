import { describe, expect, it } from "vitest";
import type { Booking, BookingStatus } from "@/lib/api/types";
import {
  checklistProgress,
  checklistSteps,
  firstName,
  nextBooking,
  todayHint,
  todaysBookings,
} from "./overview";

const at = (id: string, start: string, status: BookingStatus = "confirmed") =>
  ({ id, start, end: start, status }) as Booking;
const NOW = new Date("2026-10-01T12:00:00Z");
const time = (iso: string) => iso.slice(11, 16);

describe("todaysBookings", () => {
  it("drops released bookings and sorts by start", () => {
    const list = [
      at("c", "2026-10-01T15:00:00Z"),
      at("x", "2026-10-01T08:00:00Z", "cancelled"),
      at("a", "2026-10-01T09:00:00Z", "no_show"),
      at("e", "2026-10-01T10:00:00Z", "expired"),
      at("b", "2026-10-01T11:00:00Z", "pending_approval"),
    ];
    expect(todaysBookings(list).map((b) => b.id)).toEqual(["a", "b", "c"]);
  });

  it("sorts by the instant, not the text, through the hour the clocks go back", () => {
    // Dublin, 25 October 2026: 01:45 summer time comes before 01:15 winter time.
    const list = [at("winter", "2026-10-25T01:15:00+00:00"), at("summer", "2026-10-25T01:45:00+01:00")];
    expect(todaysBookings(list).map((b) => b.id)).toEqual(["summer", "winter"]);
    expect(todayHint(todaysBookings(list), new Date("2026-10-25T00:30:00Z"), time)).toBe("Next at 01:45");
  });
});

describe("todayHint", () => {
  it("counts approvals first", () => {
    expect(todayHint([at("a", "2026-10-01T15:00:00Z", "pending_approval")], NOW, time)).toBe(
      "1 needs approval",
    );
    expect(
      todayHint(
        [
          at("a", "2026-10-01T15:00:00Z", "pending_approval"),
          at("b", "2026-10-01T16:00:00Z", "pending_approval"),
        ],
        NOW,
        time,
      ),
    ).toBe("2 need approval");
  });

  it("then gives the next start, then whether the day is done", () => {
    const morning = at("a", "2026-10-01T09:00:00Z");
    const evening = at("b", "2026-10-01T18:00:00Z");
    expect(todayHint([morning, evening], NOW, time)).toBe("Next at 18:00");
    expect(nextBooking([morning, evening], NOW)?.id).toBe("b");
    expect(todayHint([morning], NOW, time)).toBe("All done for today");
    expect(todayHint([], NOW, time)).toBe("A quiet day");
  });
});

describe("firstName", () => {
  it("takes the first word", () => {
    expect(firstName("  Avery   Morgan ")).toBe("Avery");
    expect(firstName("")).toBeUndefined();
    expect(firstName(null)).toBeUndefined();
  });
});

describe("checklist", () => {
  it("speaks the business's vocabulary and marks payments owner-only", () => {
    const steps = checklistSteps((k) => (k === "resources" ? "therapists" : "therapist"));
    expect(steps.resources.label).toBe("Add therapists");
    expect(steps.availability.hint).toBe("When each therapist can be booked.");
    expect(steps.payments).toMatchObject({ href: "settings/payments", ownerOnly: true });
    expect(Object.values(steps).filter((s) => s.ownerOnly)).toHaveLength(1);
  });

  it("measures progress", () => {
    expect(checklistProgress([{ done: true }, { done: false }, { done: false }])).toEqual({
      done: 1,
      total: 3,
      percent: 33,
      complete: false,
    });
    expect(checklistProgress([{ done: true }])).toMatchObject({ percent: 100, complete: true });
    expect(checklistProgress([])).toMatchObject({ complete: true });
  });
});
