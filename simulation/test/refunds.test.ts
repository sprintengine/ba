import { describe, expect, it } from "vitest";
import { expectedRefunds, type RefundCase } from "../src/refunds";

const H = 3_600_000;
const base: RefundCase = {
  by: "customer",
  override: "policy",
  start: 100 * H,
  sentAt: 10 * H,
  receivedAt: 10 * H + 500,
  noticeHours: 24,
  latePercent: 50,
  paidOnlineCents: 1999,
  refundedCents: 0,
};

describe("expectedRefunds", () => {
  it("refunds a customer in full before the notice and the late share after it", () => {
    expect(expectedRefunds(base)).toEqual([1999]);
    expect(expectedRefunds({ ...base, sentAt: 90 * H, receivedAt: 90 * H + 1 })).toEqual([999]);
    expect(expectedRefunds({ ...base, sentAt: 90 * H, receivedAt: 90 * H + 1, latePercent: 0 })).toEqual([0]);
  });

  it("allows either when the request straddled the deadline", () => {
    expect(expectedRefunds({ ...base, sentAt: 76 * H - 10, receivedAt: 76 * H + 10 })).toEqual([1999, 999]);
  });

  it("refunds in full when the business cancels, and follows staff overrides", () => {
    expect(expectedRefunds({ ...base, by: "business", sentAt: 99 * H, receivedAt: 99 * H })).toEqual([1999]);
    expect(expectedRefunds({ ...base, by: "business", override: "none" })).toEqual([0]);
    expect(expectedRefunds({ ...base, override: "full", sentAt: 99 * H, receivedAt: 99 * H })).toEqual([
      1999,
    ]);
  });

  it("never refunds more than is left", () => {
    expect(expectedRefunds({ ...base, refundedCents: 1999 })).toEqual([0]);
    expect(expectedRefunds({ ...base, refundedCents: 1500, sentAt: 90 * H, receivedAt: 90 * H })).toEqual([
      499,
    ]);
    expect(expectedRefunds({ ...base, paidOnlineCents: 0 })).toEqual([0]);
  });
});
