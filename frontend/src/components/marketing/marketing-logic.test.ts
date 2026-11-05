import { demoIsOpen } from "./demo-schedule";
import { PLAN_COMPARISON, PLANS, workedExampleCosts } from "./plans";

describe("demo schedule", () => {
  const today = "2026-09-29";

  it("is never open today, in the past, on Sundays or beyond the horizon", () => {
    expect(demoIsOpen(today, today)).toBe(false);
    expect(demoIsOpen("2026-09-28", today)).toBe(false);
    expect(demoIsOpen("2026-10-04", today)).toBe(false); // Sunday
    expect(demoIsOpen("2027-01-01", today)).toBe(false);
    expect(demoIsOpen("2026-10-06", today)).toBe(true);
  });

  it("is fully booked on about one day a fortnight", () => {
    expect(demoIsOpen("2026-10-16", today)).toBe(false); // a Friday, the 16th
    expect(demoIsOpen("2026-10-15", today)).toBe(true);
  });
});

describe("plans", () => {
  it("has free, pro and business in ascending price", () => {
    expect(PLANS.map((p) => p.key)).toEqual(["free", "pro", "business"]);
    expect(PLANS.map((p) => p.price)).toEqual([0, 10, 49]);
  });

  it("comparison rows have a value for every plan", () => {
    for (const g of PLAN_COMPARISON) for (const r of g.rows) expect(r.values).toHaveLength(PLANS.length);
  });

  it("charges for bookings, never for people, and never promises unlimited bookings", () => {
    expect(PLANS.map((p) => p.summary)).toEqual([
      "100 bookings a month",
      "1,000 bookings a month",
      "10,000 bookings a month",
    ]);
    const rows = PLAN_COMPARISON.flatMap((g) => g.rows);
    for (const label of ["Staff", "Appointment types"])
      expect(rows.find((r) => r.label === label)?.values).toEqual(["Unlimited", "Unlimited", "Unlimited"]);
    expect(JSON.stringify([PLANS, PLAN_COMPARISON])).not.toMatch(/unlimited bookings|location/i);
  });

  it("worked example: 3 seats vs 2–5% commission on €8,000 vs Pro", () => {
    const c = workedExampleCosts();
    expect(c.perSeat).toEqual({ month: 45, year: 540 });
    expect(c.commission.month).toEqual([160, 400]);
    expect(c.commission.year).toEqual([1920, 4800]);
    expect(c.bookanything).toEqual({ month: 10, year: 120 });
  });
});
