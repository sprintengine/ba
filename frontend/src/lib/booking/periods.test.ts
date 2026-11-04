import { describe, expect, it } from "vitest";
import { dayPeriod, groupByDayPeriod } from "./periods";

describe("day periods", () => {
  it("splits the day at noon and 17:00", () => {
    expect(dayPeriod("00:00")).toBe("morning");
    expect(dayPeriod("11:59")).toBe("morning");
    expect(dayPeriod("12:00")).toBe("afternoon");
    expect(dayPeriod("16:45")).toBe("afternoon");
    expect(dayPeriod("17:00")).toBe("evening");
  });

  it("keeps a short list as one untitled group", () => {
    const times = ["09:00", "13:00", "18:00"];
    expect(groupByDayPeriod(times, (t) => t)).toEqual([{ key: "all", label: null, items: times }]);
  });

  it("groups a long list by period, in order, skipping empty periods", () => {
    const times = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "17:00", "17:30", "18:00"];
    const groups = groupByDayPeriod(times, (t) => t);
    expect(groups.map((g) => [g.key, g.label, g.items.length])).toEqual([
      ["morning", "Morning", 6],
      ["evening", "Evening", 3],
    ]);
    expect(groupByDayPeriod(times.slice(0, 3), (t) => t, 2).map((g) => g.key)).toEqual(["morning"]);
  });
});
