import { describe, expect, it } from "vitest";
import { business } from "@/components/dashboard/test/render";
import { policiesSchema, policySummary } from "./policies-form";

describe("policiesSchema", () => {
  it("accepts the business's policies", () => {
    expect(policiesSchema.safeParse(business.policies).success).toBe(true);
  });

  it("allows a free-cancellation window of up to 60 days, like the backend", () => {
    const parse = (h: number) =>
      policiesSchema.safeParse({ ...business.policies, cancellationNoticeHours: h });
    expect(parse(24 * 45).success).toBe(true);
    expect(parse(24 * 60).success).toBe(true);
    expect(parse(24 * 60 + 1).success).toBe(false);
  });

  it("needs at least 5 minutes of hold and a day of advance booking", () => {
    expect(policiesSchema.safeParse({ ...business.policies, holdMinutes: 4 }).success).toBe(false);
    expect(policiesSchema.safeParse({ ...business.policies, maxAdvanceDays: 0 }).success).toBe(false);
  });
});

describe("policySummary", () => {
  const p = { allowCustomerCancel: true, cancellationNoticeHours: 24, lateCancellationRefundPercent: 50 };

  it("says when people can't cancel online", () => {
    expect(policySummary({ ...p, allowCustomerCancel: false }, "Patients")).toBe(
      "Patients can't cancel online — they need to contact you.",
    );
  });

  it("explains a free window and the late refund", () => {
    expect(policySummary(p, "Patients")).toBe(
      "Patients get a full refund if they cancel at least 24 hours before. Later than that, they get 50% back.",
    );
    expect(policySummary({ ...p, lateCancellationRefundPercent: 0 }, "Clients")).toMatch(
      /they get no refund\.$/,
    );
    expect(policySummary({ ...p, lateCancellationRefundPercent: 100 }, "Clients")).toMatch(
      /they get a full refund\.$/,
    );
  });

  it("has no late window without a notice period", () => {
    expect(policySummary({ ...p, cancellationNoticeHours: 0 }, "Clients")).toBe(
      "Clients can cancel any time before the start for a full refund.",
    );
  });
});
