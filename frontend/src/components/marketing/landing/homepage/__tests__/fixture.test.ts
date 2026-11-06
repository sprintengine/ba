import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatTime } from "@/lib/format";
import { PHYSIO } from "@/components/marketing/industries/physio";
import { must } from "@/test/must";
import {
  BOOKED_SERVICE,
  dayEntries,
  demoDay,
  EARLIEST_TODAY,
  freeSlots,
  isOpenDay,
  LUMEN,
  SERVICES,
  TEAM,
  toBooking,
  whoIsFree,
} from "../fixture";

const DAY = "2026-11-05";
const times = (entries: ReturnType<typeof dayEntries>) =>
  freeSlots(entries, BOOKED_SERVICE, DAY).map((s) => s.start);

describe("the sample business", () => {
  it("charges what the physio template on the same page lists", () => {
    const listed = PHYSIO.services.map((s) => [s.name, s.durationMinutes, s.priceCents]);
    expect(SERVICES.map((s) => [s.name, s.durationMinutes, s.priceCents])).toEqual(listed);
  });

  it("shows a logo that ships with the site", () => {
    expect(existsSync(join(process.cwd(), "public", must(LUMEN.branding.logoUrl)))).toBe(true);
  });
});

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
    expect(whoIsFree(dayEntries([]), BOOKED_SERVICE, "15:30")).toBe("sam");
  });

  it("offers nothing that has passed today, and 15:30 first", () => {
    const first = freeSlots(dayEntries([]), BOOKED_SERVICE, DAY, EARLIEST_TODAY)[0]!;
    expect(formatTime(first.start, "Europe/Dublin", "en-IE")).toBe("15:30");
  });

  it("keeps 15:30 open once Sam has it, because Aoife is free then: the move the assistant makes", () => {
    const taken = [{ who: "sam", at: "15:30", customer: "x", service: BOOKED_SERVICE, room: "Room 1" }];
    const left = freeSlots(dayEntries(taken), BOOKED_SERVICE, DAY, EARLIEST_TODAY);
    expect(formatTime(left[0]!.start, "Europe/Dublin", "en-IE")).toBe("15:30");
    expect(whoIsFree(dayEntries(taken), BOOKED_SERVICE, "15:30")).toBe("aoife");
  });

  it("stops offering a time once everyone is taken", () => {
    let entries = dayEntries([]);
    const before = times(entries);
    for (;;) {
      const who = whoIsFree(entries, BOOKED_SERVICE, "15:30");
      if (!who) break;
      entries = [...entries, { who, at: "15:30", customer: "x", service: BOOKED_SERVICE, room: "Room 2" }];
    }
    expect(times(entries).length).toBeLessThan(before.length);
  });

  it("never lands on a Sunday", () => {
    expect(isOpenDay(demoDay(new Date("2026-11-08T12:00:00Z")))).toBe(true);
    expect(demoDay(new Date("2026-11-05T12:00:00Z"))).toBe(DAY);
  });
});
