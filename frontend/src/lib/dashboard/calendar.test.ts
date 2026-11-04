import { describe, expect, it } from "vitest";
import type { BookingStatus } from "@/lib/api/types";
import { isoWeekDates } from "@/lib/format/datetime";
import {
  calendarRange,
  calendarStatuses,
  calendarStep,
  eventAppearance,
  parseCalendarParams,
} from "./calendar";

const TODAY = "2026-10-01"; // a Thursday
const parse = (qs: string) => parseCalendarParams(new URLSearchParams(qs), TODAY);

describe("parseCalendarParams", () => {
  it("defaults to today's day view of every resource", () => {
    expect(parse("")).toEqual({ date: TODAY, view: "day", resourceId: "all", showCancelled: false });
  });

  it("reads the URL", () => {
    expect(parse("date=2026-12-24&view=week&resource=r1&cancelled=1")).toEqual({
      date: "2026-12-24",
      view: "week",
      resourceId: "r1",
      showCancelled: true,
    });
  });

  it("ignores malformed values", () => {
    expect(parse("date=tomorrow&view=month&cancelled=yes")).toEqual({
      date: TODAY,
      view: "day",
      resourceId: "all",
      showCancelled: false,
    });
  });
});

describe("calendarRange", () => {
  it("is the day itself in day view", () => {
    expect(calendarRange("day", TODAY)).toEqual({ days: [TODAY], from: TODAY, to: TODAY });
  });

  it("is Monday to Sunday in week view", () => {
    const week = calendarRange("week", TODAY);
    expect(week.days).toEqual(isoWeekDates(TODAY));
    expect(week.from).toBe("2026-09-28");
    expect(week.to).toBe("2026-10-04");
  });

  it("spans a year boundary", () => {
    expect(calendarRange("week", "2027-01-01")).toMatchObject({ from: "2026-12-28", to: "2027-01-03" });
  });

  it("steps a day or a week", () => {
    expect(calendarStep("day")).toBe(1);
    expect(calendarStep("week")).toBe(7);
  });
});

describe("calendarStatuses", () => {
  it("adds cancelled bookings only when shown", () => {
    expect(calendarStatuses(false)).not.toContain("cancelled");
    expect(calendarStatuses(true)).toContain("cancelled");
    expect(calendarStatuses(false)).not.toContain("expired");
  });
});

describe("eventAppearance", () => {
  const all: BookingStatus[] = [
    "held",
    "pending_approval",
    "confirmed",
    "completed",
    "cancelled",
    "no_show",
    "expired",
  ];

  it("marks unconfirmed bookings tentative and closed ones inactive", () => {
    const by = Object.fromEntries(all.map((s) => [s, eventAppearance(s)]));
    expect(all.filter((s) => by[s]?.tentative)).toEqual(["held", "pending_approval"]);
    expect(all.filter((s) => by[s]?.inactive)).toEqual(["cancelled", "no_show", "expired"]);
    expect(all.filter((s) => !by[s]?.showDot)).toEqual(["confirmed"]);
  });

  it("carries the status label and tone", () => {
    expect(eventAppearance("pending_approval")).toMatchObject({ label: "Needs approval", tone: "info" });
  });
});
