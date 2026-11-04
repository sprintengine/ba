import { describe, expect, it } from "vitest";
import {
  localWindows,
  merge,
  placementProblems,
  subtract,
  type Placement,
  type ResourceCalendar,
} from "../src/oracle";

const weekdays = (start: string, end: string) =>
  [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({ dayOfWeek, startTime: start, endTime: end }));

const cal = (id: string, overrides: ResourceCalendar["overrides"] = [], active = true): ResourceCalendar => ({
  id,
  active,
  rules: weekdays("09:00", "17:00"),
  overrides,
});

// 2026-11-04 is a Wednesday; Dublin is on UTC in November.
const day = "2026-11-04";

function placement(over: Partial<Placement> = {}): Placement {
  return {
    timeZone: "Europe/Dublin",
    start: new Date(`${day}T10:00:00Z`),
    end: new Date(`${day}T10:30:00Z`),
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    stepMinutes: 30,
    resourceIds: ["a"],
    requirements: [{ quantity: 1, resourceIds: ["a", "b"] }],
    calendars: new Map([
      ["a", cal("a")],
      ["b", cal("b")],
    ]),
    closures: [],
    mode: "public",
    minNoticeMinutes: 60,
    maxAdvanceDays: 30,
    sentAt: Date.parse(`${day}T08:00:00Z`),
    receivedAt: Date.parse(`${day}T08:00:01Z`),
    ...over,
  };
}

describe("windows", () => {
  it("merges and subtracts intervals", () => {
    expect(
      merge([
        { start: 60, end: 120 },
        { start: 100, end: 200 },
        { start: 300, end: 300 },
      ]),
    ).toEqual([{ start: 60, end: 200 }]);
    expect(subtract([{ start: 0, end: 100 }], { start: 20, end: 40 })).toEqual([
      { start: 0, end: 20 },
      { start: 40, end: 100 },
    ]);
    expect(subtract([{ start: 0, end: 100 }], { start: 200, end: 300 })).toEqual([{ start: 0, end: 100 }]);
  });

  it("applies time off, extra hours and closures", () => {
    const off = cal("a", [
      { date: day, isAvailable: false, startTime: "12:00", endTime: "13:00" },
      { date: day, isAvailable: true, startTime: "18:00", endTime: "19:00" },
    ]);
    expect(localWindows(off, day, [])).toEqual([
      { start: 540, end: 720 },
      { start: 780, end: 1020 },
      { start: 1080, end: 1140 },
    ]);
    const dayOff = cal("a", [{ date: day, isAvailable: false, startTime: null, endTime: null }]);
    expect(localWindows(dayOff, day, [])).toEqual([]);
    expect(
      localWindows(cal("a"), day, [{ date: day, isAvailable: false, startTime: null, endTime: null }]),
    ).toEqual([]);
    expect(
      localWindows(cal("a"), day, [{ date: day, isAvailable: false, startTime: "09:00", endTime: "10:00" }]),
    ).toEqual([{ start: 600, end: 1020 }]);
    expect(localWindows(cal("a", [], false), day, [])).toEqual([]);
  });
});

describe("placementProblems", () => {
  it("accepts a booking at an offered time", () => {
    expect(placementProblems(placement())).toEqual([]);
  });

  it("flags a time off the grid, outside hours, in time off or closed", () => {
    expect(
      placementProblems(
        placement({ start: new Date(`${day}T10:01:00Z`), end: new Date(`${day}T10:31:00Z`) }),
      ).join(),
    ).toMatch(/grid/);
    expect(
      placementProblems(
        placement({ start: new Date(`${day}T16:45:00Z`), end: new Date(`${day}T17:15:00Z`) }),
      ).join(),
    ).toMatch(/not open/);
    const closed = placement({
      closures: [{ date: day, isAvailable: false, startTime: null, endTime: null }],
    });
    expect(placementProblems(closed).join()).toMatch(/not open/);
  });

  it("counts buffers inside the open hours", () => {
    const early = placement({
      start: new Date(`${day}T09:00:00Z`),
      end: new Date(`${day}T09:30:00Z`),
      bufferBeforeMinutes: 10,
    });
    expect(placementProblems(early).join()).toMatch(/not open/);
  });

  it("checks notice and advance for customers only", () => {
    const soon = placement({
      sentAt: Date.parse(`${day}T09:30:00Z`),
      receivedAt: Date.parse(`${day}T09:30:01Z`),
    });
    expect(placementProblems(soon).join()).toMatch(/notice/);
    expect(placementProblems({ ...soon, mode: "staff" })).toEqual([]);
    const far = placement({
      maxAdvanceDays: 0,
      sentAt: Date.parse("2026-11-03T08:00:00Z"),
      receivedAt: Date.parse("2026-11-03T08:00:01Z"),
    });
    expect(placementProblems(far).join()).toMatch(/advance/);
    const past = placement({
      sentAt: Date.parse(`${day}T12:00:00Z`),
      receivedAt: Date.parse(`${day}T12:00:01Z`),
      mode: "staff",
    });
    expect(placementProblems(past).join()).toMatch(/past/);
  });

  it("checks the resources against the service's requirements", () => {
    expect(placementProblems(placement({ resourceIds: ["c"] })).join()).toMatch(
      /none of the service's pools/,
    );
    expect(placementProblems(placement({ resourceIds: ["a", "b"] })).join()).toMatch(/needs 1/);
  });

  it("can't judge a resource it doesn't know", () => {
    expect(placementProblems(placement({ calendars: new Map(), resourceIds: ["a"] }))).toEqual([]);
  });
});
