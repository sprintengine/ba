import { customerBooking } from "@shared/api/__tests__/fixtures/bookings";
import type { MyBookings } from "@shared/api/types";
import { bookingsFor, findMyBooking, isInactive, tabOf } from "./my-bookings";

const later = {
  ...customerBooking,
  id: "b2",
  start: "2026-10-09T09:00:00+01:00",
  end: "2026-10-09T10:00:00+01:00",
};
const earlier = {
  ...customerBooking,
  id: "b1",
  start: "2026-10-07T09:00:00+01:00",
  end: "2026-10-07T10:00:00+01:00",
};
const past = {
  ...customerBooking,
  id: "p1",
  start: "2026-09-01T09:00:00+01:00",
  end: "2026-09-01T10:00:00+01:00",
};
const data: MyBookings = { upcoming: [later, earlier], past: [past] };

describe("my bookings helpers", () => {
  it("orders upcoming soonest first and past most recent first", () => {
    expect(bookingsFor(data, "upcoming").map((b) => b.id)).toEqual(["b1", "b2"]);
    expect(bookingsFor({ upcoming: [], past: [earlier, past] }, "past").map((b) => b.id)).toEqual([
      "b1",
      "p1",
    ]);
  });

  it("finds a booking in either list, and which list", () => {
    expect(findMyBooking(data, "p1")?.id).toBe("p1");
    expect(findMyBooking(data, "nope")).toBeUndefined();
    expect(findMyBooking(undefined, "p1")).toBeUndefined();
    expect(tabOf(data, "p1")).toBe("past");
    expect(tabOf(data, "b1")).toBe("upcoming");
  });

  it("fades past and released bookings", () => {
    expect(isInactive(earlier, "past")).toBe(true);
    expect(isInactive({ ...earlier, status: "cancelled" }, "upcoming")).toBe(true);
    expect(isInactive(earlier, "upcoming")).toBe(false);
  });
});
