import { describe, expect, it } from "vitest";
import type { AiCredits } from "@/lib/api/types";
import { aiCreditUses, canUseCredits, creditsPercent, creditsTone, formatCredits } from "./credits";

const credits = (patch: Partial<AiCredits> = {}): AiCredits => ({
  limit: 100,
  used: 25,
  remaining: 75,
  runningLow: false,
  limitReached: false,
  resetsOn: "2026-11-01",
  overage: false,
  ...patch,
});

describe("AI credits", () => {
  it("formats whole credits, with a decimal when small", () => {
    expect(formatCredits(2500)).toBe("2,500");
    expect(formatCredits(142.87)).toBe("142");
    expect(formatCredits(9.56)).toBe("9.5");
    expect(formatCredits(0.56)).toBe("0.5");
    expect(formatCredits(0)).toBe("0");
  });

  it("derives the tone and the share used", () => {
    expect(creditsTone(credits())).toBe("ok");
    expect(creditsTone(credits({ runningLow: true }))).toBe("low");
    expect(creditsTone(credits({ runningLow: true, limitReached: true }))).toBe("out");
    expect(creditsPercent(credits())).toBe(25);
    expect(creditsPercent(credits({ used: 130 }))).toBe(100);
    expect(creditsPercent(credits({ limit: 0 }))).toBe(100);
    expect(canUseCredits(credits({ limitReached: true }))).toBe(false);
  });
});

describe("aiCreditUses", () => {
  it("names what draws on the credits here, or nothing", () => {
    expect(aiCreditUses({ assistantAvailable: true, sitesEnabled: true })).toBe("Bo and the AI site builder");
    expect(aiCreditUses({ assistantAvailable: true })).toBe("Bo");
    expect(aiCreditUses({ sitesEnabled: true, assistantAvailable: false })).toBe("the AI site builder");
    expect(aiCreditUses({})).toBeNull();
  });
});
