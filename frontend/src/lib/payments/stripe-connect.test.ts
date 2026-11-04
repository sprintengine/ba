import { describe, expect, it } from "vitest";
import type { ConnectExistingOutcome } from "@/lib/api/types";
import { connectMessage, connectReturn, disconnectWarning } from "./stripe-connect";

const q = (s: string) => new URLSearchParams(s);

describe("connectReturn", () => {
  it("reads a code to finish connecting, or why it stopped", () => {
    expect(connectReturn(q("stripe=complete&code=ac_1&state=s1"))).toEqual({
      kind: "complete",
      code: "ac_1",
      state: "s1",
    });
    expect(connectReturn(q("stripe=connect_error&reason=denied"))).toEqual({
      kind: "outcome",
      outcome: "denied",
      currency: null,
    });
    expect(connectReturn(q("stripe=connect_error"))).toMatchObject({ outcome: "failed" });
    // A success can't be claimed in the address.
    expect(connectReturn(q("stripe=connect_error&reason=connected"))).toMatchObject({ outcome: "failed" });
  });

  it("ignores everything else", () => {
    expect(connectReturn(q("stripe=complete&code=ac_1"))).toBeNull();
    expect(connectReturn(q("stripe=return"))).toBeNull();
    expect(connectReturn(q(""))).toBeNull();
  });
});

describe("connectMessage", () => {
  it("has words for every outcome", () => {
    const outcomes: ConnectExistingOutcome[] = [
      "denied",
      "expired",
      "invalid",
      "forbidden",
      "already_connected",
      "account_in_use",
      "currency",
      "failed",
    ];
    const messages = outcomes.map((o) => connectMessage(o));
    expect(messages.every((m) => m.tone === "error")).toBe(true);
    expect(new Set(messages.map((m) => m.message)).size).toBe(outcomes.length);
    expect(connectMessage("connected")).toEqual({
      tone: "success",
      message: "Your Stripe account is connected.",
    });
  });

  it("names the currencies, and only real currency codes", () => {
    expect(connectMessage("currency", "GBP", "EUR").message).toMatch(
      /pays out in GBP but this business charges in EUR/,
    );
    expect(connectMessage("currency", "<b>evil</b>").message).toMatch(/pays out in another currency\./);
  });
});

describe("disconnectWarning", () => {
  it("says what happens to each kind of account", () => {
    expect(disconnectWarning("Lumen", true)).toMatch(/^Lumen will stop taking online payments.*Our access/);
    expect(disconnectWarning("Lumen", false)).toMatch(/refunds of its payments keep working/);
  });
});
