import { describe, expect, it } from "vitest";
import type { AvailabilityRule } from "@/lib/api/types";
import { must } from "@/test/must";
import {
  addPeriod,
  copyDay,
  emptyWeek,
  nextRange,
  removeSchedule,
  rulesToSchedules,
  scheduleFor,
  schedulesError,
  schedulesToRules,
  updateSchedule,
  validateDay,
  validatePeriod,
  weeklyMinutes,
} from "./weekly-hours";

const rule = (p: Partial<AvailabilityRule>): AvailabilityRule => ({
  id: Math.random().toString(36),
  resourceId: "r1",
  dayOfWeek: 1,
  startTime: "09:00",
  endTime: "17:00",
  validFrom: null,
  validUntil: null,
  audienceGroupIds: [],
  ...p,
});
describe("weekly editor transforms", () => {
  const apiRules = [
    rule({ dayOfWeek: 1, startTime: "13:00", endTime: "17:00" }),
    rule({ dayOfWeek: 1, startTime: "09:00", endTime: "12:00", audienceGroupIds: ["g1"] }),
    rule({
      dayOfWeek: 6,
      startTime: "10:00",
      endTime: "14:00",
      validFrom: "2026-06-01",
      validUntil: "2026-08-31",
    }),
  ];

  it("groups rules into schedules by validity period, always-schedule first, ranges sorted", () => {
    const schedules = rulesToSchedules(apiRules);
    expect(schedules).toHaveLength(2);
    const [always, summer] = [must(schedules[0], "always"), must(schedules[1], "summer")];
    expect(always).toMatchObject({ validFrom: null, validUntil: null });
    expect(always.days[1].map((r) => r.startTime)).toEqual(["09:00", "13:00"]);
    expect(always.days[1][0]?.audienceGroupIds).toEqual(["g1"]);
    expect(summer).toMatchObject({ validFrom: "2026-06-01", validUntil: "2026-08-31" });
    expect(summer.days[6]).toHaveLength(1);
  });

  it("always has an open-ended schedule, even with no rules", () => {
    const schedules = rulesToSchedules([]);
    expect(schedules).toHaveLength(1);
    expect(schedules[0].days).toEqual(emptyWeek());
  });

  it("round-trips rules → schedules → rules", () => {
    const back = schedulesToRules(rulesToSchedules(apiRules));
    const norm = (rs: typeof back) =>
      rs
        .map(
          (r) =>
            `${r.dayOfWeek} ${r.startTime}-${r.endTime} ${r.validFrom}~${r.validUntil} [${r.audienceGroupIds.join(",")}]`,
        )
        .sort();
    expect(norm(back)).toEqual(norm(apiRules));
    expect(back.every((r) => !("id" in r) && !("resourceId" in r))).toBe(true);
  });

  it("copies a day to others without sharing references", () => {
    const week = emptyWeek();
    week[1] = [{ startTime: "09:00", endTime: "17:00", audienceGroupIds: ["g1"] }];
    week[6] = [{ startTime: "10:00", endTime: "12:00", audienceGroupIds: [] }];
    const next = copyDay(week, 1, [1, 2, 3, 4, 5]);
    expect(next[5]).toEqual(week[1]);
    expect(next[6]).toEqual(week[6]);
    must(next[2][0], "Tuesday's range").audienceGroupIds.push("x");
    expect(week[1][0]?.audienceGroupIds).toEqual(["g1"]);
  });

  it("validates ranges: end before start and overlaps", () => {
    expect(
      validateDay([
        { startTime: "09:00", endTime: "12:00", audienceGroupIds: [] },
        { startTime: "11:00", endTime: "13:00", audienceGroupIds: [] },
        { startTime: "15:00", endTime: "14:00", audienceGroupIds: [] },
      ]),
    ).toEqual([null, "Overlaps 09:00–12:00", "Ends before it starts"]);
    expect(
      validateDay([
        { startTime: "09:00", endTime: "12:00", audienceGroupIds: [] },
        { startTime: "12:00", endTime: "13:00", audienceGroupIds: [] },
      ]),
    ).toEqual([null, null]);
    expect(validatePeriod({ validFrom: "2026-10-02", validUntil: "2026-10-01" })).toMatch(/before/);
    expect(validatePeriod({ validFrom: null, validUntil: "2026-10-01" })).toBeNull();
  });

  it("refuses a range ending at midnight, which the backend can't store", () => {
    const day = (endTime: string) => validateDay([{ startTime: "18:00", endTime, audienceGroupIds: [] }]);
    expect(day("00:00")).toEqual(["Ends at midnight: use 23:59"]);
    expect(day("24:00")).toEqual(["Ends at midnight: use 23:59"]);
    expect(day("23:59")).toEqual([null]);
  });

  it("suggests the next range after the last one and totals the week", () => {
    expect(nextRange([])).toEqual({ startTime: "09:00", endTime: "17:00", audienceGroupIds: [] });
    expect(nextRange([{ startTime: "09:00", endTime: "12:00", audienceGroupIds: [] }])).toMatchObject({
      startTime: "13:00",
      endTime: "15:00",
    });
    // Never past 23:59: the backend rejects a range ending at midnight.
    expect(nextRange([{ startTime: "20:00", endTime: "23:00", audienceGroupIds: [] }])).toMatchObject({
      startTime: "23:00",
      endTime: "23:59",
    });
    const week = emptyWeek();
    week[1] = [
      { startTime: "09:00", endTime: "12:00", audienceGroupIds: [] },
      { startTime: "11:00", endTime: "13:00", audienceGroupIds: ["g"] },
    ];
    week[2] = [{ startTime: "09:00", endTime: "10:30", audienceGroupIds: [] }];
    expect(weeklyMinutes(week)).toBe(240 + 90);
  });
});

describe("schedule list", () => {
  const schedules = rulesToSchedules([
    rule({ validFrom: "2026-06-01", validUntil: "2026-08-31" }),
    rule({ startTime: "10:00", endTime: "12:00" }),
  ]);
  const summerKey = must(schedules[1], "summer").key;

  it("finds a schedule by key, falling back to the regular one", () => {
    expect(scheduleFor(schedules, summerKey).validFrom).toBe("2026-06-01");
    expect(scheduleFor(schedules, "gone")).toBe(schedules[0]);
  });

  it("updates one schedule without touching the others", () => {
    const next = updateSchedule(schedules, summerKey, { validUntil: "2026-09-30" });
    expect(next[1]?.validUntil).toBe("2026-09-30");
    expect(next[0]).toBe(schedules[0]);
    expect(schedules[1]?.validUntil).toBe("2026-08-31");
  });

  it("removes a dated schedule but always keeps the regular hours", () => {
    expect(removeSchedule(schedules, summerKey)).toEqual([schedules[0]]);
    expect(removeSchedule(schedules, schedules[0].key)).toHaveLength(2);
  });

  it("adds an empty schedule for a new period, or selects the existing one", () => {
    const added = addPeriod(schedules, "2026-12-01", null);
    expect(added.schedules).toHaveLength(3);
    expect(added.schedules[2]).toEqual({
      key: added.key,
      validFrom: "2026-12-01",
      validUntil: null,
      days: emptyWeek(),
    });
    const again = addPeriod(schedules, "2026-06-01", "2026-08-31");
    expect(again).toEqual({ schedules, key: summerKey });
  });
});

describe("schedulesError", () => {
  const withRanges = (n: number) => {
    const days = emptyWeek();
    days[1] = Array.from({ length: n }, () => ({
      startTime: "09:00",
      endTime: "10:00",
      audienceGroupIds: [],
    }));
    return [{ key: "~", validFrom: null, validUntil: null, days }];
  };

  it("allows up to 100 time ranges in all, like the backend", () => {
    expect(schedulesError(withRanges(100))).toBeNull();
    expect(schedulesError(withRanges(101))).toBe("At most 100 time ranges in all (there are 101)");
  });
});
