import { describe, expect, it } from "vitest";
import {
  BOOKING_RANGES,
  REPORT_RANGES,
  bookingRangeDates,
  parseBookingRange,
  parseReportRange,
  reportRangeDates,
} from "./date-ranges";

const TODAY = "2026-03-15";

describe("bookingRangeDates", () => {
  it.each([
    ["upcoming", { from: TODAY }],
    ["today", { from: TODAY, to: TODAY }],
    ["next7", { from: TODAY, to: "2026-03-21" }],
    ["past30", { from: "2026-02-13", to: "2026-03-14" }],
    ["all", {}],
  ] as const)("%s", (range, expected) => {
    expect(bookingRangeDates(range, TODAY)).toEqual(expected);
  });

  it("leaves unset custom bounds open", () => {
    expect(bookingRangeDates("custom", TODAY, { from: "2026-01-01", to: null })).toEqual({
      from: "2026-01-01",
      to: undefined,
    });
    expect(bookingRangeDates("custom", TODAY)).toEqual({ from: undefined, to: undefined });
  });
});

describe("reportRangeDates", () => {
  it.each([
    ["7d", { from: "2026-03-09", to: TODAY }],
    ["30d", { from: "2026-02-14", to: TODAY }],
    ["90d", { from: "2025-12-16", to: TODAY }],
    ["month", { from: "2026-03-01", to: TODAY }],
    ["lastMonth", { from: "2026-02-01", to: "2026-02-28" }],
    ["year", { from: "2026-01-01", to: TODAY }],
  ] as const)("%s", (preset, expected) => {
    expect(reportRangeDates(preset, TODAY)).toEqual(expected);
  });

  it("goes back across a year boundary for last month", () => {
    expect(reportRangeDates("lastMonth", "2026-01-10")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
  });

  it("falls back to the last 30 days for unset custom bounds", () => {
    expect(reportRangeDates("custom", TODAY)).toEqual({ from: "2026-02-14", to: TODAY });
    expect(reportRangeDates("custom", TODAY, { from: "2026-03-01", to: "2026-03-05" })).toEqual({
      from: "2026-03-01",
      to: "2026-03-05",
    });
  });
});

describe("parsing ?range=", () => {
  it("accepts every known range", () => {
    for (const r of BOOKING_RANGES) expect(parseBookingRange(r)).toBe(r);
    for (const r of REPORT_RANGES) expect(parseReportRange(r)).toBe(r);
  });

  it("falls back to the default for missing or unknown values", () => {
    expect(parseBookingRange(null)).toBe("upcoming");
    expect(parseBookingRange("7d")).toBe("upcoming");
    expect(parseReportRange(null)).toBe("30d");
    expect(parseReportRange("next7")).toBe("30d");
  });

  it("does not treat Object.prototype keys as ranges", () => {
    // `"toString" in LABELS` is true, which used to select a range with no dates (reports then crashed).
    for (const key of ["toString", "constructor", "__proto__", "hasOwnProperty"]) {
      expect(parseBookingRange(key)).toBe("upcoming");
      expect(parseReportRange(key)).toBe("30d");
    }
  });
});
