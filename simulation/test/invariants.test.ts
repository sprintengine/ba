import { describe, expect, it } from "vitest";
import { INVARIANTS, Violations } from "../src/invariants";

describe("Violations", () => {
  it("records each finding once and tells known failures apart", () => {
    const v = new Violations({ reminders: "a known bug" });
    const seen: string[] = [];
    v.onViolation((x) => seen.push(x.invariant));
    expect(v.record("no-overlap", "two bookings", { bookingId: "b1" })).not.toBeNull();
    expect(v.record("no-overlap", "two bookings")).toBeNull();
    v.record("no-overlap", "other", {}, "key");
    v.record("reminders", "late reminder");
    expect(seen).toEqual(["no-overlap", "no-overlap", "reminders"]);
    expect(v.failing().map((x) => x.invariant)).toEqual(["no-overlap", "no-overlap"]);
    expect(v.failing(true)).toHaveLength(3);
    expect(v.countsByInvariant()).toEqual({ "no-overlap": 2, reminders: 1 });
    expect(v.list[2]!.known).toBe(true);
  });

  it("describes every invariant", () => {
    for (const text of Object.values(INVARIANTS)) expect(text.length).toBeGreaterThan(20);
  });
});
