import { describe, expect, it } from "vitest";
import {
  addWindow,
  copyDayToWeekdays,
  defaultWindowFor,
  mapDayWindow,
  setDayOpen,
  summarizeHours,
  windowsForDay,
} from "../hours";
import { hours } from "./fixture";

const show = (list: { dayOfWeek: number; startTime: string; endTime: string }[]) =>
  list.map((h) => `${h.dayOfWeek} ${h.startTime}-${h.endTime}`);

describe("summarizeHours", () => {
  it("groups days with identical windows", () => {
    expect(summarizeHours([])).toBe("No opening hours");
    expect(
      summarizeHours([...hours([1, 2, 3, 4, 5, 6], "08:00", "18:00"), ...hours([7], "10:00", "16:00")]),
    ).toBe("Mon–Sat 08:00–18:00 · Sun 10:00–16:00");
    expect(summarizeHours(hours([1, 2, 4], "09:00", "17:00"))).toBe("Mon, Tue 09:00–17:00 · Thu 09:00–17:00");
    expect(summarizeHours([...hours([6], "13:00", "17:00"), ...hours([6], "09:00", "12:00")])).toBe(
      "Sat 09:00–12:00, 13:00–17:00",
    );
  });
});

describe("hour edits", () => {
  const week = hours([1, 2, 3, 4, 5], "09:00", "17:00");

  it("opens a day with the most common window and closes it", () => {
    expect(defaultWindowFor([])).toEqual({ startTime: "09:00", endTime: "17:00" });
    const mixed = [...week, ...hours([6, 7], "10:00", "14:00")];
    expect(defaultWindowFor(mixed)).toEqual({ startTime: "09:00", endTime: "17:00" });
    expect(show(windowsForDay(setDayOpen(hours([6, 7], "10:00", "14:00"), 1, true), 1))).toEqual([
      "1 10:00-14:00",
    ]);
    expect(setDayOpen(week, 1, true)).toBe(week);
    expect(windowsForDay(setDayOpen(week, 1, false), 1)).toEqual([]);
  });

  it("adds a window an hour after the day's last one, until the evening", () => {
    expect(show(addWindow([], 1))).toEqual(["1 09:00-12:00"]);
    expect(show(windowsForDay(addWindow(week, 1), 1))).toEqual(["1 09:00-17:00", "1 18:00-21:00"]);
    expect(show(windowsForDay(addWindow(hours([1], "09:00", "21:30"), 1), 1))).toEqual([
      "1 09:00-21:30",
      "1 22:30-23:30",
    ]);
    const late = hours([1], "09:00", "21:31");
    expect(addWindow(late, 1)).toBe(late);
  });

  it("edits or removes one window of a day by display index", () => {
    const split = [...hours([1], "13:00", "17:00"), ...hours([1], "09:00", "12:00")];
    expect(show(mapDayWindow(split, 1, 0, (h) => ({ ...h, startTime: "08:00" })))).toEqual([
      "1 13:00-17:00",
      "1 08:00-12:00",
    ]);
    expect(show(mapDayWindow(split, 1, 1, () => null))).toEqual(["1 09:00-12:00"]);
    expect(mapDayWindow(split, 2, 0, () => null)).toBe(split);
  });

  it("copies a day to the other working days only", () => {
    const out = copyDayToWeekdays([...hours([3], "07:00", "11:00"), ...hours([1, 6], "09:00", "17:00")], 3);
    expect(show(out).sort()).toEqual([
      "1 07:00-11:00",
      "2 07:00-11:00",
      "3 07:00-11:00",
      "4 07:00-11:00",
      "5 07:00-11:00",
      "6 09:00-17:00",
    ]);
  });
});
