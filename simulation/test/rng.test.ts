import { describe, expect, it } from "vitest";
import { hashString, Rng } from "../src/rng";

describe("Rng", () => {
  it("gives the same stream for the same label", () => {
    const a = new Rng("seed-1");
    const b = new Rng("seed-1");
    expect(Array.from({ length: 5 }, () => a.next())).toEqual(Array.from({ length: 5 }, () => b.next()));
  });

  it("derives children by name, not by how much the parent drew", () => {
    const a = new Rng("seed-1");
    const b = new Rng("seed-1");
    b.next();
    b.next();
    expect(a.child("action:7").int(0, 1_000_000)).toBe(b.child("action:7").int(0, 1_000_000));
    expect(a.child("action:7").next()).not.toBe(a.child("action:8").next());
  });

  it("keeps draws in range", () => {
    const rng = new Rng("range");
    for (let i = 0; i < 500; i++) {
      const n = rng.int(3, 7);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
      const f = rng.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
    expect(() => rng.int(5, 4)).toThrow();
  });

  it("picks, samples and shuffles without losing elements", () => {
    const rng = new Rng("lists");
    const items = [1, 2, 3, 4, 5];
    expect(items).toContain(rng.pick(items));
    expect(rng.maybePick([])).toBeUndefined();
    expect(() => rng.pick([])).toThrow();
    expect(rng.shuffle(items).sort()).toEqual(items);
    const sample = rng.sample(items, 3);
    expect(new Set(sample).size).toBe(3);
    expect(rng.sample(items, -1)).toEqual([]);
  });

  it("weights choices and never picks a zero weight", () => {
    const rng = new Rng("weights");
    const counts = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 2000; i++)
      counts[
        rng.weighted([
          ["a", 1],
          ["b", 3],
          ["c", 0],
        ] as const)
      ]++;
    expect(counts.c).toBe(0);
    expect(counts.b).toBeGreaterThan(counts.a * 2);
    expect(() => rng.weighted([["x", 0]] as const)).toThrow();
  });

  it("makes chance and tokens", () => {
    const rng = new Rng("misc");
    expect(rng.chance(0)).toBe(false);
    expect(rng.chance(1)).toBe(true);
    expect(rng.token(8)).toMatch(/^[a-z2-9]{8}$/);
    expect(hashString("a")).not.toBe(hashString("b"));
  });
});
