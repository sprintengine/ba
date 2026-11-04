import { describe, expect, it } from "vitest";
import { afterToRefind, nextSlotWindows } from "./next-slot";

describe("next available time", () => {
  it("searches from today to the last bookable date, a month at a time", () => {
    expect(nextSlotWindows("2026-10-20", "2026-12-05", null, "Europe/Dublin")).toEqual([
      { from: "2026-10-20", to: "2026-10-31" },
      { from: "2026-11-01", to: "2026-11-30" },
      { from: "2026-12-01", to: "2026-12-05" },
    ]);
  });

  it("starts on the day of `after` when it is later than today, in the business's timezone", () => {
    // 23:30 UTC on 2 Nov is already 3 Nov in Auckland.
    expect(nextSlotWindows("2026-10-20", "2026-11-30", "2026-11-02T23:30:00Z", "Pacific/Auckland")).toEqual([
      { from: "2026-11-03", to: "2026-11-30" },
    ]);
    // An `after` in the past searches from today.
    expect(nextSlotWindows("2026-10-20", "2026-10-31", "2026-10-01T09:00:00Z", "Europe/Dublin")).toEqual([
      { from: "2026-10-20", to: "2026-10-31" },
    ]);
  });

  it("has nothing to search past the last bookable date", () => {
    expect(nextSlotWindows("2026-10-20", "2026-10-31", "2026-11-04T09:00:00Z", "Europe/Dublin")).toEqual([]);
  });

  it("finds a chosen time again from a minute before it", () => {
    // 10:00 in Dublin (summer time, UTC+1) is 09:00 UTC.
    expect(afterToRefind("2026-10-06", "10:00", "Europe/Dublin")).toBe("2026-10-06T08:59:00.000Z");
  });
});
