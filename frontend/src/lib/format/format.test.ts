import { describe, expect, it } from "vitest";
import {
  addDaysToPlainDate,
  addMonths,
  addMonthsKeepingDay,
  browserTimeZone,
  centsToInput,
  currencySymbol,
  daysInMonth,
  formatDate,
  formatDuration,
  formatMoney,
  formatPrice,
  formatRelativeDay,
  formatTime,
  formatTimeRange,
  isoWeekDates,
  isoWeekday,
  isValidTimeZone,
  monthEnd,
  monthStart,
  parseMoney,
  parseTimeInput,
  startOfIsoWeek,
  supportedTimeZones,
  timeZoneOptions,
  toPlainDate,
  toTimeOfDay,
  todayInTz,
  zonedToIso,
} from "./index";

describe("money", () => {
  it("formats minor units with currency", () => {
    expect(formatMoney(4550, "EUR")).toBe("€45.50");
    expect(formatMoney(4500, "EUR")).toBe("€45");
    expect(formatMoney(4500, "EUR", { exact: true })).toBe("€45.00");
    expect(formatMoney(123456, "EUR")).toBe("€1,234.56");
    expect(formatMoney(500, "EUR", { signed: true })).toBe("+€5");
    expect(formatMoney(2000, "GBP")).toBe("£20");
    expect(formatMoney(1500, "JPY")).toBe("¥1,500");
  });
  it("caches currency lookups without mixing currencies or locales", () => {
    expect(formatMoney(1500, "JPY")).toBe("¥1,500");
    expect(formatMoney(1500, "EUR")).toBe("€15");
    expect(currencySymbol("EUR")).toBe("€");
    expect(currencySymbol("EUR")).toBe("€");
    expect(currencySymbol("GBP")).toBe("£");
    expect(centsToInput(1500, "JPY")).toBe("1500");
    expect(centsToInput(1500, "EUR")).toBe("15.00");
  });
  it("formatPrice says Free for zero", () => {
    expect(formatPrice(0, "EUR")).toBe("Free");
  });
  it("parses user input", () => {
    expect(parseMoney("45")).toBe(4500);
    expect(parseMoney("45.5")).toBe(4550);
    expect(parseMoney("45,50")).toBe(4550);
    expect(parseMoney("€1,234.50")).toBe(123450);
    expect(parseMoney("1.234,50")).toBe(123450);
    expect(parseMoney("1,234")).toBe(123400);
    // A repeated separator only ever groups thousands.
    expect(parseMoney("1,234,567")).toBe(123456700);
    expect(parseMoney("1.234.567")).toBe(123456700);
    expect(parseMoney("1,234,567.89")).toBe(123456789);
    expect(parseMoney("1.234.567,89")).toBe(123456789);
    // A whole part of zero is never a thousands group: a mistyped third decimal isn't a price 1000× higher.
    expect(parseMoney("0.125")).toBe(13);
    expect(parseMoney(".125")).toBe(13);
    expect(parseMoney("0,125")).toBe(13);
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
    expect(centsToInput(4550)).toBe("45.50");
    expect(centsToInput(null)).toBe("");
  });
});

describe("datetime", () => {
  const tz = "Europe/Dublin";
  it("formats instants in the business timezone, not the browser's", () => {
    // 08:00Z is 09:00 in Dublin (IST, UTC+1) and 04:00 in New York.
    expect(formatTime("2026-10-01T08:00:00Z", tz)).toBe("09:00");
    expect(formatTime("2026-10-01T08:00:00Z", "America/New_York")).toBe("04:00");
    expect(formatTimeRange("2026-10-01T09:00:00+01:00", "2026-10-01T09:45:00+01:00", tz)).toBe(
      "09:00 – 09:45",
    );
  });
  it("formats plain dates without timezone drift", () => {
    expect(formatDate("2026-10-01", "Pacific/Auckland", "medium")).toBe("1 Oct 2026");
    expect(formatDate("2026-10-01", tz, "long")).toBe("Thursday, 1 October");
  });
  it("converts wall-clock time in a zone to ISO with offset", () => {
    expect(zonedToIso("2026-10-01", "09:00", tz)).toBe("2026-10-01T09:00:00+01:00");
    expect(zonedToIso("2026-12-01", "09:00", tz)).toBe("2026-12-01T09:00:00+00:00");
  });
  it("reads instants across Dublin's DST changes", () => {
    // Fall back, Sun 25 Oct 2026: 02:00 IST → 01:00 GMT, so 01:30 happens twice.
    expect(toTimeOfDay("2026-10-25T00:30:00Z", tz)).toBe("01:30");
    expect(toTimeOfDay("2026-10-25T00:59:00Z", tz)).toBe("01:59");
    expect(toTimeOfDay("2026-10-25T01:00:00Z", tz)).toBe("01:00");
    expect(toTimeOfDay("2026-10-25T01:30:00Z", tz)).toBe("01:30");
    expect(toPlainDate("2026-10-24T23:30:00Z", tz)).toBe("2026-10-25");
    // Spring forward, Sun 29 Mar 2026: 01:00 GMT → 02:00 IST.
    expect(toTimeOfDay("2026-03-29T00:59:00Z", tz)).toBe("00:59");
    expect(toTimeOfDay("2026-03-29T01:00:00Z", tz)).toBe("02:00");
    expect(toPlainDate("2026-03-28T23:30:00Z", tz)).toBe("2026-03-28");
    // West of UTC and half-hour offsets.
    expect(toPlainDate("2026-10-25T00:30:00Z", "America/New_York")).toBe("2026-10-24");
    expect(toTimeOfDay("2026-10-25T00:30:00Z", "America/New_York")).toBe("20:30");
    expect(toTimeOfDay("2026-10-25T00:30:00Z", "Asia/Kolkata")).toBe("06:00");
    expect(toTimeOfDay(new Date("2026-10-01T23:00:00Z"), tz)).toBe("00:00");
  });
  it("resolves wall-clock times at Dublin's DST changes as java.time does", () => {
    // Fall back: the repeated hour takes the earlier (summer) offset.
    expect(zonedToIso("2026-10-25", "00:30", tz)).toBe("2026-10-25T00:30:00+01:00");
    expect(zonedToIso("2026-10-25", "01:00", tz)).toBe("2026-10-25T01:00:00+01:00");
    expect(zonedToIso("2026-10-25", "01:30", tz)).toBe("2026-10-25T01:30:00+01:00");
    expect(zonedToIso("2026-10-25", "02:00", tz)).toBe("2026-10-25T02:00:00+00:00");
    // Spring forward: the skipped hour moves on by the gap.
    expect(zonedToIso("2026-03-29", "00:30", tz)).toBe("2026-03-29T00:30:00+00:00");
    expect(zonedToIso("2026-03-29", "01:00", tz)).toBe("2026-03-29T02:00:00+01:00");
    expect(zonedToIso("2026-03-29", "01:30", tz)).toBe("2026-03-29T02:30:00+01:00");
    expect(zonedToIso("2026-03-29", "02:00", tz)).toBe("2026-03-29T02:00:00+01:00");
    // The same rules west of UTC, and offsets that aren't whole hours.
    expect(zonedToIso("2026-11-01", "01:30", "America/New_York")).toBe("2026-11-01T01:30:00-04:00");
    expect(zonedToIso("2026-03-08", "02:30", "America/New_York")).toBe("2026-03-08T03:30:00-04:00");
    expect(zonedToIso("2026-10-01", "09:00", "Asia/Kolkata")).toBe("2026-10-01T09:00:00+05:30");
    expect(zonedToIso("2026-10-01", "09:00", "Pacific/Chatham")).toBe("2026-10-01T09:00:00+13:45");
    expect(zonedToIso("2026-10-01", "09:00", "UTC")).toBe("2026-10-01T09:00:00+00:00");
    expect(zonedToIso("2026-10-01", "00:00", tz)).toBe("2026-10-01T00:00:00+01:00");
  });
  it("derives plain dates in a zone", () => {
    expect(toPlainDate("2026-10-01T23:30:00Z", tz)).toBe("2026-10-02");
    expect(todayInTz(tz, new Date("2026-10-01T23:30:00Z"))).toBe("2026-10-02");
    expect(addDaysToPlainDate("2026-10-31", 1)).toBe("2026-11-01");
    expect(isoWeekday("2026-10-04")).toBe(7);
    expect(isoWeekday("2026-10-05")).toBe(1);
  });
  it("relative days", () => {
    const now = new Date("2026-10-01T10:00:00Z");
    expect(formatRelativeDay("2026-10-01", tz, "en-IE", now)).toBe("Today");
    expect(formatRelativeDay("2026-10-02", tz, "en-IE", now)).toBe("Tomorrow");
    expect(formatRelativeDay("2026-10-05", tz, "en-IE", now)).toBe("Mon, 5 Oct");
  });
  it("durations", () => {
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(90)).toBe("1 h 30 min");
    expect(formatDuration(120)).toBe("2 h");
  });
  it("parses lenient time input", () => {
    expect(parseTimeInput("9")).toBe("09:00");
    expect(parseTimeInput("930")).toBe("09:30");
    expect(parseTimeInput("9.30")).toBe("09:30");
    expect(parseTimeInput("14:05")).toBe("14:05");
    expect(parseTimeInput("2pm")).toBe("14:00");
    expect(parseTimeInput("12am")).toBe("00:00");
    expect(parseTimeInput("25")).toBeNull();
    expect(parseTimeInput("9:7")).toBeNull();
    expect(parseTimeInput("nope")).toBeNull();
  });
});

describe("calendar months and weeks", () => {
  it("steps months across years", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-10", 15)).toBe("2028-01");
  });
  it("knows month lengths and bounds", () => {
    expect(daysInMonth("2028-02")).toBe(29);
    expect(daysInMonth("2026-02")).toBe(28);
    expect(monthStart("2026-10-17")).toBe("2026-10-01");
    expect(monthEnd("2026-11-17")).toBe("2026-11-30");
  });
  it("keeps the day when stepping months, clamped to shorter months", () => {
    expect(addMonthsKeepingDay("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsKeepingDay("2026-03-15", -2)).toBe("2026-01-15");
  });
  it("finds the ISO week", () => {
    expect(startOfIsoWeek("2026-10-01")).toBe("2026-09-28"); // Thursday → Monday
    expect(startOfIsoWeek("2026-10-04")).toBe("2026-09-28"); // Sunday → previous Monday
    expect(startOfIsoWeek("2026-09-28")).toBe("2026-09-28");
    expect(isoWeekDates("2026-10-01")).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
  });
});

describe("timezones", () => {
  it("validates zones with Intl", () => {
    expect(isValidTimeZone("Europe/Dublin")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone("UTC")).toBe(true);
    // Intl knows these, but the backend only takes region ids (they don't follow daylight saving time).
    expect(isValidTimeZone("GMT")).toBe(false);
    expect(isValidTimeZone("EST")).toBe(false);
    expect(isValidTimeZone("+01:00")).toBe(false);
  });
  it("lists zones and reads the browser's", () => {
    expect(supportedTimeZones()).toContain("Europe/Dublin");
    expect(typeof browserTimeZone()).toBe("string");
  });
  it("builds picker options once per zone, with readable labels", () => {
    const options = timeZoneOptions(
      ["America/New_York", "Europe/Dublin", "America/New_York"],
      new Date("2026-07-01T12:00:00Z"),
    );
    expect(options.map((o) => o.label)).toEqual(["America/New York", "Europe/Dublin"]);
    expect(options[1]?.hint).toBe("IST");
  });
});
