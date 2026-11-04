import { describe, expect, it } from "vitest";
import {
  overrideKind,
  timeOffDefaults,
  timeOffReady,
  timeOffSchema,
  timeOffTimeError,
  timeOffToInput,
  type TimeOffValues,
} from "./time-off";

const issues = (v: TimeOffValues) => {
  const r = timeOffSchema.safeParse(v);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
};
const base = timeOffDefaults("2026-10-05");

describe("overrideKind", () => {
  it("tells extra hours, part of a day and a whole day apart", () => {
    expect(overrideKind({ isAvailable: true, startTime: "18:00" })).toBe("extra");
    expect(overrideKind({ isAvailable: false, startTime: "09:00" })).toBe("partial");
    expect(overrideKind({ isAvailable: false, startTime: null })).toBe("off");
  });
});

describe("time off form", () => {
  it("starts as a day off today and is ready to save", () => {
    expect(base).toEqual({
      date: "2026-10-05",
      kind: "off",
      startTime: "09:00",
      endTime: "13:00",
      reason: "",
    });
    expect(timeOffReady(base)).toBe(true);
    expect(issues(base)).toEqual([]);
  });

  it("drops the times for a whole day and trims the note", () => {
    expect(timeOffToInput({ ...base, date: "2026-10-05", reason: "  " })).toEqual({
      date: "2026-10-05",
      isAvailable: false,
      startTime: null,
      endTime: null,
      reason: null,
    });
    expect(timeOffToInput({ ...base, date: "2026-10-05", kind: "extra", reason: " Late night " })).toEqual({
      date: "2026-10-05",
      isAvailable: true,
      startTime: "09:00",
      endTime: "13:00",
      reason: "Late night",
    });
  });

  it("needs a date, and both times in order for part of a day or extra hours", () => {
    expect(timeOffReady({ ...base, date: null })).toBe(false);
    expect(issues({ ...base, date: null })).toEqual(["date: Pick a date"]);
    const partial = { ...base, kind: "partial" as const };
    expect(timeOffReady({ ...partial, endTime: null })).toBe(false);
    expect(issues({ ...partial, endTime: null })).toEqual(["endTime: Enter both times"]);
    expect(timeOffTimeError({ ...partial, endTime: "08:00" })).toBe("Ends before it starts");
    expect(timeOffTimeError({ ...partial, endTime: "00:00" })).toBe("Ends at midnight: use 23:59");
    expect(timeOffReady({ ...partial, endTime: "00:00" })).toBe(false);
    expect(timeOffTimeError({ ...base, endTime: "08:00" })).toBeNull();
  });

  it("keeps the note within the backend's 200 characters", () => {
    expect(issues({ ...base, reason: "x".repeat(200) })).toEqual([]);
    expect(issues({ ...base, reason: "x".repeat(201) })).toEqual(["reason: Keep it under 200 characters"]);
  });
});
