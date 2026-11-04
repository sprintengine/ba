import { describe, expect, it } from "vitest";
import type { AvailabilityOverride, AvailabilityRule } from "@/lib/api/types";
import { mergeIntervals, openIntervalsForDate, rangeError, subtractInterval } from "./windows";

const rule = (p: Partial<AvailabilityRule>): AvailabilityRule => ({
  id: Math.random().toString(36),
  resourceId: "r1",
  dayOfWeek: 1,
  startTime: "09:00",
  endTime: "17:00",
  validFrom: null,
  validUntil: null,
  audienceGroupIds: [],
  ...p,
});
const override = (p: Partial<AvailabilityOverride>): AvailabilityOverride => ({
  id: Math.random().toString(36),
  resourceId: "r1",
  date: "2026-10-05",
  isAvailable: false,
  startTime: null,
  endTime: null,
  reason: null,
  ...p,
});

// 2026-10-05 is a Monday.
describe("openIntervalsForDate", () => {
  it("merges overlapping weekly rules", () => {
    const rules = [
      rule({ startTime: "09:00", endTime: "13:00" }),
      rule({ startTime: "12:00", endTime: "17:00" }),
    ];
    expect(openIntervalsForDate(rules, [], [], "2026-10-05")).toEqual([{ start: 540, end: 1020 }]);
  });

  it("respects the weekday and validity period", () => {
    const rules = [
      rule({ dayOfWeek: 2 }),
      rule({ startTime: "08:00", endTime: "10:00", validFrom: "2026-10-06" }),
      rule({ startTime: "18:00", endTime: "20:00", validUntil: "2026-10-04" }),
    ];
    expect(openIntervalsForDate(rules, [], [], "2026-10-05")).toEqual([]);
    expect(openIntervalsForDate(rules, [], [], "2026-10-12")).toEqual([{ start: 480, end: 600 }]);
  });

  it("applies day off, partial unavailability, extra hours and closures in backend order", () => {
    const rules = [rule({})];
    expect(openIntervalsForDate(rules, [override({})], [], "2026-10-05")).toEqual([]);
    expect(
      openIntervalsForDate(rules, [override({ startTime: "12:00", endTime: "13:00" })], [], "2026-10-05"),
    ).toEqual([
      { start: 540, end: 720 },
      { start: 780, end: 1020 },
    ]);
    // Extra hours are added after unavailability, so they survive a day off.
    expect(
      openIntervalsForDate(
        rules,
        [override({}), override({ isAvailable: true, startTime: "18:00", endTime: "20:00" })],
        [],
        "2026-10-05",
      ),
    ).toEqual([{ start: 1080, end: 1200 }]);
    // Business closures win over everything.
    expect(
      openIntervalsForDate(
        rules,
        [override({ isAvailable: true, startTime: "18:00", endTime: "20:00" })],
        [override({ resourceId: null })],
        "2026-10-05",
      ),
    ).toEqual([]);
    expect(
      openIntervalsForDate(
        rules,
        [],
        [override({ resourceId: null, startTime: "09:00", endTime: "10:00" })],
        "2026-10-05",
      ),
    ).toEqual([{ start: 600, end: 1020 }]);
    // Overrides on other dates are ignored.
    expect(openIntervalsForDate(rules, [override({ date: "2026-10-06" })], [], "2026-10-05")).toEqual([
      { start: 540, end: 1020 },
    ]);
  });

  it("supports 24:00 as end of day", () => {
    expect(
      openIntervalsForDate([rule({ startTime: "20:00", endTime: "24:00" })], [], [], "2026-10-05"),
    ).toEqual([{ start: 1200, end: 1440 }]);
  });
});

describe("interval helpers", () => {
  it("merges and subtracts", () => {
    expect(
      mergeIntervals([
        { start: 60, end: 120 },
        { start: 0, end: 60 },
        { start: 200, end: 100 },
      ]),
    ).toEqual([{ start: 0, end: 120 }]);
    expect(subtractInterval([{ start: 0, end: 100 }], { start: 20, end: 30 })).toEqual([
      { start: 0, end: 20 },
      { start: 30, end: 100 },
    ]);
    expect(subtractInterval([{ start: 0, end: 100 }], { start: 0, end: 100 })).toEqual([]);
  });
});

describe("rangeError", () => {
  it("accepts a range within one day", () => {
    expect(rangeError("09:00", "17:00")).toBeNull();
    expect(rangeError("00:00", "23:59")).toBeNull();
  });

  it("refuses ends before the start and at midnight", () => {
    expect(rangeError("17:00", "09:00")).toBe("Ends before it starts");
    expect(rangeError("09:00", "09:00")).toBe("Ends before it starts");
    expect(rangeError("18:00", "00:00")).toBe("Ends at midnight: use 23:59");
    expect(rangeError("18:00", "24:00")).toBe("Ends at midnight: use 23:59");
  });
});
