import { describe, expect, it } from "vitest";
import {
  chartTickInterval,
  isEmptyReport,
  parseReportParams,
  percentOf,
  rankResources,
  rankServices,
} from "./reports";

describe("parseReportParams", () => {
  const parse = (qs: string) => parseReportParams(new URLSearchParams(qs), "2026-03-15");
  it("defaults to the last 30 days", () => {
    expect(parse("")).toEqual({ preset: "30d", range: { from: "2026-02-14", to: "2026-03-15" } });
  });
  it("reads a custom range, ignoring malformed dates", () => {
    expect(parse("range=custom&from=2026-01-01&to=2026-01-31").range).toEqual({
      from: "2026-01-01",
      to: "2026-01-31",
    });
    expect(parse("range=custom&from=nope&to=2026-03-01").range).toEqual({
      from: "2026-02-14",
      to: "2026-03-01",
    });
  });
  it("reads a custom range that ends before it starts the right way round", () => {
    expect(parse("range=custom&from=2026-03-10&to=2026-03-01").range).toEqual({
      from: "2026-03-01",
      to: "2026-03-10",
    });
  });
  it("ignores from/to for presets", () => {
    expect(parse("range=7d&from=2020-01-01").range).toEqual({ from: "2026-03-09", to: "2026-03-15" });
  });
});

describe("chartTickInterval", () => {
  it("labels every day up to two weeks, then thins the labels", () => {
    expect(chartTickInterval(7)).toBe(0);
    expect(chartTickInterval(14)).toBe(0);
    expect(chartTickInterval(30)).toBe(2);
    expect(chartTickInterval(45)).toBe(4);
    expect(chartTickInterval(90)).toBe(7);
    expect(chartTickInterval(365)).toBe(30);
  });
});

describe("percentOf", () => {
  it("rounds to a whole percentage", () => {
    expect(percentOf(1, 3)).toBe(33);
    expect(percentOf(2, 3)).toBe(67);
    expect(percentOf(0, 5)).toBe(0);
  });

  it("is null without a total", () => {
    expect(percentOf(0, 0)).toBeNull();
  });
});

describe("isEmptyReport", () => {
  const totals = {
    bookings: 0,
    confirmed: 0,
    cancelled: 0,
    noShows: 0,
    revenueCents: 0,
    refundedCents: 0,
    newCustomers: 0,
  };
  it("is empty with no bookings and no revenue", () => {
    expect(isEmptyReport(totals)).toBe(true);
    expect(isEmptyReport({ ...totals, bookings: 1 })).toBe(false);
    expect(isEmptyReport({ ...totals, revenueCents: 500 })).toBe(false);
  });
});

describe("rankings", () => {
  it("ranks services by bookings, then revenue, without mutating the input", () => {
    const rows = [
      { serviceId: "a", name: "A", bookings: 2, revenueCents: 100 },
      { serviceId: "b", name: "B", bookings: 5, revenueCents: 0 },
      { serviceId: "c", name: "C", bookings: 2, revenueCents: 900 },
    ];
    expect(rankServices(rows).map((r) => r.serviceId)).toEqual(["b", "c", "a"]);
    expect(rows.map((r) => r.serviceId)).toEqual(["a", "b", "c"]);
  });

  it("ranks resources by utilisation", () => {
    const row = (resourceId: string, utilisation: number) => ({
      resourceId,
      name: resourceId,
      bookedMinutes: 0,
      availableMinutes: 0,
      utilisation,
    });
    expect(rankResources([row("a", 0.2), row("b", 0.9), row("c", 0.5)]).map((r) => r.resourceId)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });
});
