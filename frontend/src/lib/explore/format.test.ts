import { describe, expect, it } from "vitest";
import { sharedSlotDay } from "./format";

const NOW = new Date("2026-11-06T09:00:00Z");
const TZ = "Europe/Dublin";

describe("sharedSlotDay", () => {
  it("names the day when every time falls on today or tomorrow", () => {
    expect(sharedSlotDay(["2026-11-06T10:00:00Z", "2026-11-06T17:00:00Z"], TZ, NOW)).toBe("Today");
    expect(sharedSlotDay(["2026-11-07T10:00:00Z"], TZ, NOW)).toBe("Tomorrow");
  });

  it("leaves the day on each time when they differ or are further off", () => {
    expect(sharedSlotDay(["2026-11-06T10:00:00Z", "2026-11-07T10:00:00Z"], TZ, NOW)).toBeNull();
    expect(sharedSlotDay(["2026-11-10T10:00:00Z"], TZ, NOW)).toBeNull();
    expect(sharedSlotDay([], TZ, NOW)).toBeNull();
  });
});
