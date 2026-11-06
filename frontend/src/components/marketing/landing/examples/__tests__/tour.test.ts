import { describe, expect, it } from "vitest";
import { EXAMPLE_CARDS } from "../cards";
import { EXAMPLES, toBooking } from "../fixtures";
import { endOfTour, personTarget, tourFor, typeTarget } from "../tour";

const examples = Object.values(EXAMPLES);

describe("the example businesses", () => {
  it("has one for every card, and the three the page must show", () => {
    expect(Object.keys(EXAMPLES).sort()).toEqual(EXAMPLE_CARDS.map((c) => c.slug).sort());
    expect(EXAMPLES["hair-salon"].team).toHaveLength(3);
    expect(EXAMPLES["gp-practice"].team.map((t) => t.name)).toEqual([
      "Dr Nolan",
      "Dr Farrell",
      "Nurse Kelly",
    ]);
    expect(EXAMPLES["car-wash"].team).toHaveLength(1);
    expect(EXAMPLES["car-wash"].types.map((t) => t.name)).toEqual(["Wash", "Polish", "Full valet"]);
  });

  it("only books people for appointments they do, inside the hours, and never twice at once", () => {
    for (const ex of examples) {
      const entries = [...ex.day, ex.tour.booking.entry];
      const spans = entries.map(([who, at, , id]) => {
        const type = ex.types.find((t) => t.id === id);
        expect(type?.staff, `${ex.slug} ${id}`).toContain(who);
        const start = Number(at.slice(0, 2)) * 60 + Number(at.slice(3));
        return { who, start, end: start + (type?.minutes ?? 0) };
      });
      for (const s of spans) {
        expect(s.start, ex.slug).toBeGreaterThanOrEqual(ex.hours[0] * 60);
        expect(s.end, ex.slug).toBeLessThanOrEqual(ex.hours[1] * 60);
      }
      for (const a of spans)
        for (const b of spans)
          if (a !== b && a.who === b.who) expect(a.end <= b.start || b.end <= a.start, ex.slug).toBe(true);
    }
  });

  it("offers the tour's booking among its free times", () => {
    for (const ex of examples) expect(ex.tour.booking.times).toContain(ex.tour.booking.entry[1]);
  });

  it("draws an entry as a booking with its person and room", () => {
    const ex = EXAMPLES["car-wash"];
    const booking = toBooking(ex, ex.tour.booking.entry, "2026-11-05");
    expect(booking.service.name).toBe("Polish");
    expect(booking.resources.map((r) => r.kind)).toEqual(["person", "space"]);
  });
});

describe("the cursor's walk", () => {
  it("visits two appointment types, then makes a booking", () => {
    const ex = EXAMPLES["gp-practice"];
    const targets = tourFor(ex).map((s) => s.target);
    expect(targets).toEqual([
      typeTarget("long"),
      typeTarget("bloods"),
      personTarget("kelly"),
      "new-booking",
      "draft-time",
      "draft-book",
    ]);
  });

  it("has no choice of person when there's one person", () => {
    expect(tourFor(EXAMPLES["car-wash"]).some((s) => s.target.startsWith("person-"))).toBe(false);
  });

  it("ends, for reduced motion too, with the booking on the calendar and nothing half done", () => {
    for (const ex of examples) {
      const end = endOfTour(tourFor(ex), "");
      expect(end).toMatchObject({ booked: true, draft: null, type: null, person: null });
      expect(end.say).toBe(ex.tour.booking.says);
    }
  });

  it("names no customer on a photo: cards are labelled by kind of business", () => {
    for (const c of EXAMPLE_CARDS)
      expect(`${c.label} ${c.shape} ${c.types} ${c.alt}`).not.toMatch(/Dr |Danny|Shauna/);
  });
});
