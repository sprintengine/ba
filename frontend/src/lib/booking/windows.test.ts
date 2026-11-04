import { describe, expect, it } from "vitest";
import { business } from "./__tests__/fixtures";
import {
  firstAvailableDate,
  maxBookableDate,
  monthWindows,
  pickerWindows,
  withBookableTime,
} from "./windows";

describe("availability windows", () => {
  it("splits by calendar month, clamped to the bookable range, each ≤31 days", () => {
    const w = monthWindows("2026-09-28", "2026-11-05", "2026-09-30", "2026-11-03");
    expect(w).toEqual([
      { from: "2026-09-30", to: "2026-09-30" },
      { from: "2026-10-01", to: "2026-10-31" },
      { from: "2026-11-01", to: "2026-11-03" },
    ]);
    expect(monthWindows("2026-12-01", "2026-12-31", "2027-01-01", "2027-02-01")).toEqual([]);
  });

  it("loads the shown month, and the focused week only where it reaches outside it, as whole months", () => {
    const october = { from: "2026-10-01", to: "2026-10-31" };
    expect(pickerWindows("2026-10", null, "2026-10-01", "2026-12-31")).toEqual([october]);
    // A focused week inside the shown month adds nothing: the month covers it.
    expect(pickerWindows("2026-10", "2026-10-15", "2026-10-01", "2026-12-31")).toEqual([october]);
    // A week running into the next month adds that month.
    expect(pickerWindows("2026-10", "2026-10-30", "2026-10-01", "2026-12-31")).toEqual([
      october,
      { from: "2026-11-01", to: "2026-11-30" },
    ]);
    // A focused date in another month (e.g. "next available") adds its month.
    expect(pickerWindows("2026-10", "2026-11-04", "2026-10-01", "2026-12-31")).toEqual([
      october,
      { from: "2026-11-01", to: "2026-11-30" },
    ]);
    // Clamped to the bookable range, and not repeated when it equals the shown month's window.
    expect(pickerWindows("2026-10", "2026-12-30", "2026-10-01", "2026-12-31")).toEqual([
      october,
      { from: "2026-12-01", to: "2026-12-31" },
    ]);
    expect(pickerWindows("2026-10", "2026-10-01", "2026-10-01", "2026-10-04")).toEqual([
      { from: "2026-10-01", to: "2026-10-04" },
    ]);
    expect(pickerWindows("2026-10", "2026-10-01", "2026-09-30", "2026-12-31")).toEqual([
      october,
      { from: "2026-09-30", to: "2026-09-30" },
    ]);
  });

  it("keeps a chosen date and time only while they can be booked", () => {
    const range = { today: "2026-10-01", max: "2026-11-30", nowTime: "10:00" };
    const sel = (date: string | null, time: string | null) => ({ serviceId: "s1", date, time });
    expect(withBookableTime(sel("2026-10-05", "09:00"), range)).toEqual(sel("2026-10-05", "09:00"));
    expect(withBookableTime(sel(null, null), range)).toEqual(sel(null, null));
    // Before today or after the last bookable day: neither.
    expect(withBookableTime(sel("2026-09-30", "14:00"), range)).toEqual(sel(null, null));
    expect(withBookableTime(sel("2026-12-01", "14:00"), range)).toEqual(sel(null, null));
    // Today: a time that has passed goes, the day stays.
    expect(withBookableTime(sel("2026-10-01", "09:45"), range)).toEqual(sel("2026-10-01", null));
    expect(withBookableTime(sel("2026-10-01", "10:00"), range)).toEqual(sel("2026-10-01", "10:00"));
    expect(withBookableTime(sel("2026-11-30", "18:00"), range)).toEqual(sel("2026-11-30", "18:00"));
  });

  it("loads the week the week strip shows where it runs into another month", () => {
    const october = { from: "2026-10-01", to: "2026-10-31" };
    const november = { from: "2026-11-01", to: "2026-11-30" };
    // A date chosen early in October, the strip moved on to 26 October - 1 November.
    expect(pickerWindows("2026-10", "2026-10-06", "2026-10-01", "2026-12-31", "2026-10-26")).toEqual([
      october,
      november,
    ]);
    expect(pickerWindows("2026-10", "2026-10-06", "2026-10-01", "2026-12-31", "2026-10-19")).toEqual([
      october,
    ]);
  });

  it("finds the next available day", () => {
    const days = new Map([
      ["2026-10-01", []],
      ["2026-10-03", [{}]],
      ["2026-10-02", []],
    ]);
    expect(firstAvailableDate(days, "2026-10-01")).toBe("2026-10-03");
    expect(firstAvailableDate(days, "2026-10-04")).toBeNull();
  });

  it("lets the service override how far ahead can be booked", () => {
    expect(maxBookableDate("2026-10-01", null, business.policies)).toBe("2026-11-30");
    expect(maxBookableDate("2026-10-01", { maxAdvanceDays: 7 }, business.policies)).toBe("2026-10-08");
  });
});
