import { describe, expect, it } from "vitest";
import type { Booking } from "@/lib/api/types";
import { groupBookings } from "../group-bookings";

const booking = (id: string, over: Partial<Booking> = {}) =>
  ({
    id,
    start: "2026-11-05T06:00:00Z",
    end: "2026-11-05T07:00:00Z",
    status: "confirmed",
    priceCents: 1500,
    service: { id: "class", name: "Group class", color: "#000" },
    option: null,
    resources: [{ id: "studio", name: "Studio" }],
    ...over,
  }) as unknown as Booking;

const dayOf = (b: Booking) => b.start.slice(0, 10);

describe("groupBookings", () => {
  it("makes one row of the people in one class", () => {
    const [day] = groupBookings([booking("a"), booking("b"), booking("c")], dayOf);
    expect(day?.slots).toHaveLength(1);
    expect(day?.slots[0]?.bookings.map((b) => b.id)).toEqual(["a", "b", "c"]);
    expect(day?.count).toBe(3);
  });

  it("keeps different times, services and people apart", () => {
    const [day] = groupBookings(
      [
        booking("a"),
        booking("b", { start: "2026-11-05T08:00:00Z", end: "2026-11-05T09:00:00Z" }),
        booking("c", { service: { id: "other", name: "Other", color: "#000" } }),
        booking("d", { resources: [{ id: "room", name: "Room" }] } as Partial<Booking>),
      ],
      dayOf,
    );
    expect(day?.slots).toHaveLength(4);
  });

  it("gives each day its own heading, and leaves cancelled money out of the total", () => {
    const days = groupBookings(
      [
        booking("a"),
        booking("b", { status: "cancelled" }),
        booking("c", { start: "2026-11-06T06:00:00Z", end: "2026-11-06T07:00:00Z" }),
      ],
      dayOf,
    );
    expect(days.map((d) => [d.key, d.count, d.cents])).toEqual([
      ["2026-11-05", 2, 1500],
      ["2026-11-06", 1, 1500],
    ]);
  });
});
