import { describe, expect, it } from "vitest";
import type { ReleaseSchedule } from "@/lib/api/types";
import { previewDays, releaseDate, sameRelease, scheduledAt, type ReleaseTiming } from "./calendar";
import { defaultScheduleForm, formToInput, scheduleFormSchema, scheduleToForm } from "./schedule-form";
import {
  formatClock,
  liveDay,
  opensLabel,
  scheduleSummary,
  servicesLabel,
  weekdayName,
  whoLabel,
} from "./text";

const TZ = "Europe/Dublin";
const daily = (daysBefore = 1, time = "17:00", weekdaysOnly = false): ReleaseTiming => ({
  cadence: "daily",
  time,
  daysBefore,
  weekdaysOnly,
  weekday: null,
  weeksAhead: null,
});
const weekly = (weekday = 5, time = "22:00", weeksAhead = 1): ReleaseTiming => ({
  cadence: "weekly",
  time,
  daysBefore: null,
  weekdaysOnly: false,
  weekday,
  weeksAhead,
});

describe("release calendar (the backend's ReleaseCalendar)", () => {
  it("opens each day the given days before, at the release time in the business timezone", () => {
    expect(scheduledAt(daily(), "2026-10-15", TZ)).toBe("2026-10-14T17:00:00+01:00");
    expect(scheduledAt(daily(0, "08:00"), "2026-10-15", TZ)).toBe("2026-10-15T08:00:00+01:00");
    expect(releaseDate(daily(14), "2026-10-15")).toBe("2026-10-01");
  });

  it("moves a weekend release back to the Friday when skipping weekends", () => {
    const t = daily(1, "17:00", true);
    expect(releaseDate(t, "2026-10-19")).toBe("2026-10-16");
    expect(releaseDate(t, "2026-10-18")).toBe("2026-10-16");
    expect(releaseDate(t, "2026-10-17")).toBe("2026-10-16");
    expect(releaseDate(t, "2026-10-20")).toBe("2026-10-19");
    expect(releaseDate(daily(1), "2026-10-19")).toBe("2026-10-18");
  });

  it("opens a whole week on the release weekday, the given weeks before", () => {
    for (let day = 19; day <= 25; day++) {
      expect(scheduledAt(weekly(), `2026-10-${day}`, TZ)).toBe("2026-10-16T22:00:00+01:00");
    }
    expect(releaseDate(weekly(7), "2026-10-19")).toBe("2026-10-18");
    expect(releaseDate(weekly(5, "22:00", 2), "2026-10-19")).toBe("2026-10-09");
    expect(releaseDate(weekly(1), "2026-10-19")).toBe("2026-10-12");
  });

  it("follows daylight saving and moves a time in the spring gap forward", () => {
    expect(scheduledAt(daily(), "2026-10-25", TZ)).toBe("2026-10-24T17:00:00+01:00");
    expect(scheduledAt(daily(), "2026-10-26", TZ)).toBe("2026-10-25T17:00:00+00:00");
    expect(scheduledAt(daily(0, "01:30"), "2026-03-29", TZ)).toBe("2026-03-29T02:30:00+01:00");
  });

  it("knows which days are released together", () => {
    expect(sameRelease(weekly(), "2026-10-21")).toEqual([
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
    ]);
    expect(sameRelease(daily(1, "17:00", true), "2026-10-18")).toEqual([
      "2026-10-17",
      "2026-10-18",
      "2026-10-19",
    ]);
    expect(sameRelease(daily(), "2026-10-15")).toEqual(["2026-10-15"]);
  });

  it("previews the next days and which have opened", () => {
    const now = new Date("2026-10-13T19:45:00Z"); // Tue 20:45 in Dublin
    expect(previewDays(daily(), "2026-10-13", 3, TZ, now)).toEqual([
      { date: "2026-10-13", opensAt: "2026-10-12T17:00:00+01:00", open: true },
      { date: "2026-10-14", opensAt: "2026-10-13T17:00:00+01:00", open: true },
      { date: "2026-10-15", opensAt: "2026-10-14T17:00:00+01:00", open: false },
    ]);
  });
});

describe("release wording", () => {
  it("summarises a schedule in a sentence", () => {
    expect(scheduleSummary(daily())).toBe("Each day opens the day before at 17:00.");
    expect(scheduleSummary(daily(1, "17:00", true))).toBe(
      "Each day opens the day before at 17:00. Monday opens on Friday.",
    );
    expect(scheduleSummary(daily(0, "08:00", true))).toBe(
      "Each day opens the same day at 08:00. Releases that would fall at the weekend happen on the Friday before.",
    );
    expect(scheduleSummary(daily(3))).toBe("Each day opens 3 days before at 17:00.");
    expect(scheduleSummary(weekly())).toBe("Every Friday at 22:00, next week (Mon–Sun) opens.");
    expect(scheduleSummary(weekly(7, "18:00", 2))).toBe("Every Sunday at 18:00, the week after next opens.");
    expect(scheduleSummary(weekly(1, "09:00", 3))).toBe(
      "Every Monday at 09:00, the week 3 weeks ahead opens.",
    );
  });

  it("formats clock times and weekdays in the locale", () => {
    expect(formatClock("17:00")).toBe("17:00");
    expect(formatClock("17:00", "en-US")).toMatch(/^0?5:00\s?PM$/i);
    expect(weekdayName(1)).toBe("Monday");
    expect(weekdayName(7)).toBe("Sunday");
  });

  it("says when a release opens relative to today", () => {
    const now = new Date("2026-10-13T12:00:00Z");
    expect(opensLabel("2026-10-13T22:00:00+01:00", TZ, undefined, now)).toBe("today at 22:00");
    expect(opensLabel("2026-10-14T17:00:00+01:00", TZ, undefined, now)).toBe("tomorrow at 17:00");
    expect(opensLabel("2026-10-12T17:00:00+01:00", TZ, undefined, now)).toBe("yesterday at 17:00");
    expect(opensLabel("2026-10-16T17:00:00+01:00", TZ, undefined, now)).toBe("Fri, 16 Oct at 17:00");
  });

  it("names the services and customers a schedule covers", () => {
    const services = [
      { id: "s1", name: "GP consultation" },
      { id: "s2", name: "Nurse appointment" },
    ];
    expect(servicesLabel(["s1", "s2"], services)).toBe("GP consultation, Nurse appointment");
    expect(servicesLabel(["gone"], services)).toBe("No services");
    const groups = [{ id: "g1", name: "GMS / medical card holder" }];
    expect(whoLabel({ everyone: true, groupIds: [] }, groups)).toBe("Everyone");
    expect(whoLabel({ everyone: false, groupIds: ["g1"] }, groups)).toBe("GMS / medical card holder");
  });
});

describe("schedule form", () => {
  const schedule: ReleaseSchedule = {
    id: "r1",
    name: "GMS next-day",
    serviceIds: ["s1"],
    everyone: false,
    groupIds: ["g1"],
    cadence: "weekly",
    time: "22:00",
    daysBefore: null,
    weekdaysOnly: false,
    weekday: 5,
    weeksAhead: 2,
    status: "paused",
    createdAt: "2026-09-01T10:00:00+01:00",
    updatedAt: "2026-09-01T10:00:00+01:00",
  };

  it("round-trips a schedule and sends only the chosen cadence's settings", () => {
    const form = scheduleToForm(schedule);
    expect(form).toMatchObject({
      cadence: "weekly",
      weekday: 5,
      weeksAhead: 2,
      daysBefore: 1,
      active: false,
    });
    expect(formToInput(form)).toEqual({
      name: "GMS next-day",
      serviceIds: ["s1"],
      everyone: false,
      groupIds: ["g1"],
      cadence: "weekly",
      time: "22:00",
      daysBefore: null,
      weekdaysOnly: false,
      weekday: 5,
      weeksAhead: 2,
      active: false,
    });
    expect(formToInput({ ...form, cadence: "daily", weekdaysOnly: true, everyone: true })).toMatchObject({
      daysBefore: 1,
      weekdaysOnly: true,
      weekday: null,
      weeksAhead: null,
      groupIds: [],
    });
  });

  it("checks the name, services, groups and time", () => {
    const issues = (v: Partial<ReturnType<typeof defaultScheduleForm>>) =>
      scheduleFormSchema
        .safeParse({ ...defaultScheduleForm(["s1"]), name: "Next day", ...v })
        .error?.issues.map((i) => i.path.join("."));
    expect(issues({})).toBeUndefined();
    expect(issues({ name: " " })).toEqual(["name"]);
    expect(issues({ serviceIds: [] })).toEqual(["serviceIds"]);
    expect(issues({ everyone: false })).toEqual(["groupIds"]);
    expect(issues({ time: "25:00" })).toEqual(["time"]);
    expect(issues({ time: null })).toEqual(["time"]);
  });
});

it("shows a release whose time has passed as open, whatever the data said when it was fetched", () => {
  const day = {
    date: "2026-10-14",
    scheduledAt: "2026-10-13T17:00:00+01:00",
    opensAt: "2026-10-13T17:00:00+01:00",
    state: "scheduled" as const,
    changed: false,
    changedBy: null,
    changedAt: null,
    times: 4,
  };
  expect(liveDay(day, new Date("2026-10-13T15:59:00Z")).state).toBe("scheduled");
  expect(liveDay(day, new Date("2026-10-13T16:00:00Z")).state).toBe("open");
  expect(liveDay({ ...day, state: "held", opensAt: null }, new Date("2026-10-20T00:00:00Z")).state).toBe(
    "held",
  );
});
