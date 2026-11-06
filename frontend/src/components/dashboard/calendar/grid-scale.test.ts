import { describe, expect, it } from "vitest";
import { fitHourPx, hourPx, readableHourPx } from "./grid-scale";

describe("calendar scale", () => {
  it("keeps the owner's scales as the default", () => {
    expect(hourPx("day")).toBe(200);
    expect(hourPx("week")).toBe(124);
  });

  it("halves about the height in Compact", () => {
    expect(hourPx("day", "compact")).toBe(100);
    expect(hourPx("week", "compact")).toBe(72);
  });

  it("fits the working day in the window, to scale", () => {
    expect(fitHourPx("day", 840, 14)).toBe(60);
    expect(fitHourPx("week", 720, 12)).toBe(60);
    expect(hourPx("week", "fit", { available: 720, hours: 12 })).toBe(60);
  });

  it("stops at a readable height, and never grows past Comfortable", () => {
    expect(fitHourPx("day", 200, 16, 15)).toBe(readableHourPx(15));
    expect(readableHourPx(15)).toBe(56);
    expect(fitHourPx("day", 500, 14, 60)).toBe(36);
    expect(fitHourPx("week", 2000, 4)).toBe(124);
  });

  it("falls back to Comfortable before the window is measured", () => {
    expect(hourPx("day", "fit")).toBe(200);
    expect(hourPx("week", "fit", { available: 0, hours: 12 })).toBe(124);
  });
});
