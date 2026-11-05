import { describe, expect, it } from "vitest";
import {
  dayEntries,
  demoDay,
  freeSlots,
  isOpenDay,
  SPORTS_MASSAGE,
  TEAM,
  toBooking,
  whoIsFree,
} from "../fixture";

const DAY = "2026-11-05";
const times = (entries: ReturnType<typeof dayEntries>) =>
  freeSlots(entries, SPORTS_MASSAGE, DAY).map((s) => s.start);

describe("the demo's day", () => {
  it("never puts two bookings on one person at once", () => {
    for (const who of TEAM) {
      const spans = dayEntries([])
        .filter((e) => e.who === who.id)
        .map((e) => toBooking(e, DAY))
        .sort((a, b) => a.start.localeCompare(b.start));
      spans.slice(1).forEach((b, i) => expect(b.start >= spans[i]!.end).toBe(true));
    }
  });

  it("offers 15:30, the time the script books, with Sam", () => {
    expect(whoIsFree(dayEntries([]), SPORTS_MASSAGE, "15:30")).toBe("sam");
  });

  it("stops offering a time once everyone is taken", () => {
    let entries = dayEntries([]);
    const before = times(entries);
    for (;;) {
      const who = whoIsFree(entries, SPORTS_MASSAGE, "15:30");
      if (!who) break;
      entries = [...entries, { who, at: "15:30", customer: "x", service: SPORTS_MASSAGE, room: "Room 2" }];
    }
    expect(times(entries).length).toBeLessThan(before.length);
  });

  it("never lands on a Sunday", () => {
    expect(isOpenDay(demoDay(new Date("2026-11-08T12:00:00Z")))).toBe(true);
    expect(demoDay(new Date("2026-11-05T12:00:00Z"))).toBe(DAY);
  });
});
