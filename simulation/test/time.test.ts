import { describe, expect, it } from "vitest";
import {
  addDays,
  formatDuration,
  formatTime,
  localParts,
  monthStart,
  offsetMinutes,
  parseDuration,
  parseTime,
  weekdayOf,
  zonedInstant,
} from "../src/time";

describe("time helpers", () => {
  it("reads local parts in a zone", () => {
    const p = localParts(Date.parse("2026-07-01T08:30:00Z"), "Europe/Dublin");
    expect(p).toMatchObject({ date: "2026-07-01", minutes: 9 * 60 + 30, dayOfWeek: 3 });
    expect(localParts(Date.parse("2026-07-01T23:30:00Z"), "Asia/Tokyo").date).toBe("2026-07-02");
  });

  it("finds the instant of a local time, across DST and half-hour zones", () => {
    expect(zonedInstant("2026-07-01", 9 * 60, "Europe/Dublin").toISOString()).toBe(
      "2026-07-01T08:00:00.000Z",
    );
    expect(zonedInstant("2026-01-15", 9 * 60, "Europe/Dublin").toISOString()).toBe(
      "2026-01-15T09:00:00.000Z",
    );
    expect(zonedInstant("2026-01-15", 9 * 60, "Asia/Kolkata").toISOString()).toBe("2026-01-15T03:30:00.000Z");
    expect(zonedInstant("2026-01-15", 24 * 60, "UTC").toISOString()).toBe("2026-01-16T00:00:00.000Z");
    // Overlap (clocks go back 02:00 → 01:00 on 25 October 2026): the earlier instant.
    expect(zonedInstant("2026-10-25", 60 + 30, "Europe/Dublin").toISOString()).toBe(
      "2026-10-25T00:30:00.000Z",
    );
    // Gap (01:00 → 02:00 on 29 March 2026): moved later by the gap.
    expect(zonedInstant("2026-03-29", 60 + 30, "Europe/Dublin").toISOString()).toBe(
      "2026-03-29T01:30:00.000Z",
    );
    expect(offsetMinutes(Date.parse("2026-07-01T00:00:00Z"), "Europe/Dublin")).toBe(60);
  });

  it("does calendar arithmetic", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(weekdayOf("2026-11-01")).toBe(7);
    expect(weekdayOf("2026-11-02")).toBe(1);
    expect(monthStart("2026-11-17")).toBe("2026-11-01");
    expect(parseTime("13:45")).toBe(825);
    expect(formatTime(825)).toBe("13:45");
  });

  it("parses and formats durations", () => {
    expect(parseDuration("90s")).toBe(90_000);
    expect(parseDuration("10m")).toBe(600_000);
    expect(parseDuration("2h")).toBe(7_200_000);
    expect(parseDuration("3d")).toBe(259_200_000);
    expect(parseDuration("250")).toBe(250);
    expect(() => parseDuration("soon")).toThrow(/Not a duration/);
    expect(formatDuration(45_000)).toBe("45s");
    expect(formatDuration(570_000)).toBe("9m 30s");
    expect(formatDuration(600_000)).toBe("10m");
    expect(formatDuration(7_500_000)).toBe("2h 5m");
    expect(formatDuration(3_600_000)).toBe("1h");
    expect(formatDuration(97_200_000)).toBe("1d 3h");
    expect(formatDuration(86_400_000)).toBe("1d");
  });
});
