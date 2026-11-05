import { describe, expect, it } from "vitest";
import {
  assignLanes,
  capLanes,
  groupSessions,
  groupByDate,
  layoutDay,
  minuteOfDate,
  snapMinute,
  visibleHourRange,
} from "./calendar-layout";

const TZ = "Europe/Dublin";
const ev = (
  id: string,
  start: string,
  end: string,
  extra: Partial<{ bufferBeforeMinutes: number; bufferAfterMinutes: number }> = {},
) => ({
  id,
  start,
  end,
  ...extra,
});

describe("minuteOfDate", () => {
  it("uses wall-clock minutes in the business timezone, not the browser's", () => {
    // 08:00Z in October is 09:00 in Dublin (IST, UTC+1).
    expect(minuteOfDate("2026-10-01T08:00:00Z", "2026-10-01", TZ)).toBe(9 * 60);
    expect(minuteOfDate("2026-10-01T09:00:00+01:00", "2026-10-01", TZ)).toBe(9 * 60);
    // Same instant seen from New York is 04:00.
    expect(minuteOfDate("2026-10-01T08:00:00Z", "2026-10-01", "America/New_York")).toBe(4 * 60);
  });

  it("offsets by whole days for instants on other dates", () => {
    expect(minuteOfDate("2026-10-02T00:30:00+01:00", "2026-10-01", TZ)).toBe(1440 + 30);
    expect(minuteOfDate("2026-09-30T23:00:00+01:00", "2026-10-01", TZ)).toBe(-60);
  });

  it("keeps grid positions honest across DST changes", () => {
    // Clocks go back on 25 Oct 2026 in Dublin (02:00 IST → 01:00 GMT).
    expect(minuteOfDate("2026-10-25T09:00:00Z", "2026-10-25", TZ)).toBe(9 * 60); // 09:00 GMT
    expect(minuteOfDate("2026-10-24T08:00:00Z", "2026-10-24", TZ)).toBe(9 * 60); // 09:00 IST
    // Clocks go forward on 29 Mar 2026 (01:00 GMT → 02:00 IST).
    expect(minuteOfDate("2026-03-29T09:00:00+01:00", "2026-03-29", TZ)).toBe(9 * 60);
  });
});

describe("layoutDay", () => {
  it("positions a single event at its wall-clock minutes with buffers", () => {
    const [p] = layoutDay(
      [
        ev("a", "2026-10-01T09:00:00+01:00", "2026-10-01T09:45:00+01:00", {
          bufferBeforeMinutes: 10,
          bufferAfterMinutes: 15,
        }),
      ],
      "2026-10-01",
      TZ,
    );
    expect(p).toMatchObject({
      startMin: 540,
      endMin: 585,
      blockStartMin: 530,
      blockEndMin: 600,
      lane: 0,
      lanes: 1,
    });
  });

  it("splits overlapping events into lanes and leaves separate clusters full width", () => {
    const out = layoutDay(
      [
        ev("a", "2026-10-01T09:00:00+01:00", "2026-10-01T10:00:00+01:00"),
        ev("b", "2026-10-01T09:30:00+01:00", "2026-10-01T10:30:00+01:00"),
        ev("c", "2026-10-01T10:00:00+01:00", "2026-10-01T10:15:00+01:00"),
        ev("d", "2026-10-01T12:00:00+01:00", "2026-10-01T13:00:00+01:00"),
      ],
      "2026-10-01",
      TZ,
    );
    const byId = Object.fromEntries(out.map((p) => [p.item.id, p]));
    expect(byId.a).toMatchObject({ lane: 0, lanes: 2 });
    expect(byId.b).toMatchObject({ lane: 1, lanes: 2 });
    // c starts when a ends → reuses lane 0 in the same cluster (b still running).
    expect(byId.c).toMatchObject({ lane: 0, lanes: 2 });
    expect(byId.d).toMatchObject({ lane: 0, lanes: 1 });
  });

  it("treats back-to-back events as not overlapping", () => {
    const out = layoutDay(
      [
        ev("a", "2026-10-01T09:00:00+01:00", "2026-10-01T10:00:00+01:00"),
        ev("b", "2026-10-01T10:00:00+01:00", "2026-10-01T11:00:00+01:00"),
      ],
      "2026-10-01",
      TZ,
    );
    expect(out.map((p) => p.lanes)).toEqual([1, 1]);
  });

  it("handles three-way overlap", () => {
    const out = layoutDay(
      [
        ev("a", "2026-10-01T09:00:00+01:00", "2026-10-01T11:00:00+01:00"),
        ev("b", "2026-10-01T09:00:00+01:00", "2026-10-01T10:00:00+01:00"),
        ev("c", "2026-10-01T09:15:00+01:00", "2026-10-01T09:45:00+01:00"),
      ],
      "2026-10-01",
      TZ,
    );
    expect(new Set(out.map((p) => p.lane))).toEqual(new Set([0, 1, 2]));
    expect(out.every((p) => p.lanes === 3)).toBe(true);
    // Longer event first on equal start.
    expect(out[0]?.item.id).toBe("a");
  });

  it("clamps events crossing midnight and flags continuation", () => {
    const items = [ev("n", "2026-10-01T23:00:00+01:00", "2026-10-02T01:00:00+01:00")];
    const [day1] = layoutDay(items, "2026-10-01", TZ);
    expect(day1).toMatchObject({
      startMin: 1380,
      endMin: 1440,
      continuesAfter: true,
      continuesBefore: false,
    });
    const [day2] = layoutDay(items, "2026-10-02", TZ);
    expect(day2).toMatchObject({ startMin: 0, endMin: 60, continuesBefore: true, continuesAfter: false });
    expect(layoutDay(items, "2026-10-03", TZ)).toEqual([]);
  });

  it("drops events on other days", () => {
    expect(
      layoutDay([ev("x", "2026-10-02T09:00:00+01:00", "2026-10-02T10:00:00+01:00")], "2026-10-01", TZ),
    ).toEqual([]);
  });

  it("lays out 200 events quickly", () => {
    const items = Array.from({ length: 200 }, (_, i) => {
      const h = 8 + (i % 10);
      return ev(
        `e${i}`,
        `2026-10-01T${String(h).padStart(2, "0")}:00:00+01:00`,
        `2026-10-01T${String(h).padStart(2, "0")}:45:00+01:00`,
      );
    });
    const t0 = performance.now();
    const out = layoutDay(items, "2026-10-01", TZ);
    expect(out).toHaveLength(200);
    expect(performance.now() - t0).toBeLessThan(250);
    expect(Math.max(...out.map((p) => p.lanes))).toBe(20);
  });
});

describe("assignLanes", () => {
  it("is stable for equal events (sorted by id)", () => {
    const e = (id: string) => ({ item: { id }, startMin: 0, endMin: 30, lane: 0, lanes: 1 });
    expect(assignLanes([e("b"), e("a")]).map((x) => [x.item.id, x.lane])).toEqual([
      ["a", 0],
      ["b", 1],
    ]);
  });
});

describe("groupByDate", () => {
  it("buckets by business-timezone date, repeating multi-day items", () => {
    const map = groupByDate(
      [
        ev("late", "2026-10-01T23:30:00Z", "2026-10-02T00:15:00Z"), // 00:30–01:15 on 2 Oct in Dublin
        ev("span", "2026-10-01T23:00:00+01:00", "2026-10-02T01:00:00+01:00"),
        ev("midnight", "2026-10-01T23:00:00+01:00", "2026-10-02T00:00:00+01:00"),
      ],
      TZ,
    );
    expect(
      map
        .get("2026-10-02")
        ?.map((e) => e.id)
        .sort(),
    ).toEqual(["late", "span"]);
    expect(
      map
        .get("2026-10-01")
        ?.map((e) => e.id)
        .sort(),
    ).toEqual(["midnight", "span"]);
  });
});

describe("visibleHourRange", () => {
  it("defaults to a working day", () => {
    expect(visibleHourRange([], [])).toEqual([8, 18]);
  });
  it("expands to opening hours and events with an hour of padding", () => {
    expect(
      visibleHourRange(
        [{ start: 7 * 60, end: 20 * 60 + 30 }],
        [{ blockStartMin: 6 * 60 + 45, blockEndMin: 7 * 60 }],
      ),
    ).toEqual([5, 22]);
  });
  it("never exceeds the day", () => {
    expect(visibleHourRange([{ start: 0, end: 1440 }], [])).toEqual([0, 24]);
  });
});

describe("snapMinute / weeks", () => {
  it("snaps clicks to the 15-minute grid", () => {
    // 1px per minute, grid starts at 08:00; click 37px down → 08:37 → 08:30.
    expect(snapMinute(37, 1, 480)).toBe(510);
    expect(snapMinute(-10, 1, 0)).toBe(0);
    expect(snapMinute(99999, 1, 0)).toBe(1425);
  });
});

describe("groupSessions", () => {
  const b = (id: string, service: string, start: string, end: string, resources: string[]) => ({
    id,
    start,
    end,
    service: { id: service },
    resources: resources.map((r) => ({ id: r })),
  });

  it("draws a class's attendees as one entry, and keeps clashes and other times apart", () => {
    const entries = groupSessions([
      b("a", "class", "2026-11-04T15:00:00Z", "2026-11-04T16:00:00Z", ["studio"]),
      b("b", "class", "2026-11-04T15:00:00Z", "2026-11-04T16:00:00Z", ["studio"]),
      b("c", "class", "2026-11-04T16:00:00Z", "2026-11-04T17:00:00Z", ["studio"]),
      b("d", "check", "2026-11-04T15:00:00Z", "2026-11-04T16:00:00Z", ["studio"]),
      b("e", "class", "2026-11-04T15:00:00Z", "2026-11-04T16:00:00Z", ["hall"]),
    ]);
    expect(entries.map((e) => e.bookings.map((x) => x.id))).toEqual([["a", "b"], ["c"], ["d"], ["e"]]);
    expect(entries[0]?.id).toMatch(/^session:/);
    expect(entries[1]?.id).toBe("c");
  });

  it("keeps the longest buffers of a session", () => {
    const [entry] = groupSessions([
      { ...b("a", "s", "2026-11-04T15:00:00Z", "2026-11-04T16:00:00Z", ["r"]), bufferAfterMinutes: 10 },
      { ...b("b", "s", "2026-11-04T15:00:00Z", "2026-11-04T16:00:00Z", ["r"]), bufferAfterMinutes: 15 },
    ]);
    expect(entry?.bufferAfterMinutes).toBe(15);
    expect(entry?.bufferBeforeMinutes).toBe(0);
  });
});

describe("capLanes", () => {
  it("folds a whole overlap into one block across the column, leaving nothing beside it", () => {
    const at = (lane: number) => ({ startMin: 600, endMin: 660, lane, lanes: 3, cluster: 0 });
    const lone = { startMin: 720, endMin: 780, lane: 0, lanes: 1, cluster: 1 };
    const { shown, overflow } = capLanes([at(0), at(1), at(2), lone], 2, { foldWhole: true });
    expect(shown).toEqual([lone]);
    expect(overflow).toHaveLength(1);
    expect(overflow[0]).toMatchObject({ lane: 0, lanes: 1, startMin: 600, endMin: 660 });
    expect(overflow[0]?.events).toHaveLength(3);
  });

  const ev = (id: string, startMin: number, endMin: number) => ({
    item: { id },
    startMin,
    endMin,
    lane: 0,
    lanes: 1,
    cluster: 0,
  });

  it("leaves clusters that fit alone", () => {
    const events = assignLanes([ev("a", 0, 60), ev("b", 30, 90)]);
    const { shown, overflow } = capLanes(events, 3);
    expect(shown).toHaveLength(2);
    expect(overflow).toEqual([]);
  });

  it("folds lanes past the limit into '+N' markers in the last lane, one per overlapping run", () => {
    const events = assignLanes([
      ev("a", 0, 60),
      ev("b", 0, 60),
      ev("c", 0, 60),
      ev("d", 0, 60),
      ev("e", 120, 180),
      ev("f", 120, 180),
      ev("g", 30, 200),
    ]);
    const { shown, overflow } = capLanes(events, 3);
    expect(shown.every((e) => e.lanes <= 3 && e.lane < 3)).toBe(true);
    const hidden = overflow.flatMap((o) => o.events.map((e) => e.item.id));
    expect(new Set([...shown.map((e) => e.item.id), ...hidden]).size).toBe(7);
    expect(overflow.every((o) => o.lane === 2 && o.lanes === 3)).toBe(true);
    for (const o of overflow) {
      expect(o.startMin).toBe(Math.min(...o.events.map((e) => e.startMin)));
      expect(o.endMin).toBe(Math.max(...o.events.map((e) => e.endMin)));
    }
  });

  it("gives each cluster its own index in time order", () => {
    const events = assignLanes([ev("late", 300, 360), ev("a", 0, 60), ev("b", 30, 90)]);
    expect(Object.fromEntries(events.map((e) => [e.item.id, e.cluster]))).toEqual({ a: 0, b: 0, late: 1 });
  });
});
