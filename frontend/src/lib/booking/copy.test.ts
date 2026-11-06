import { describe, expect, it } from "vitest";
import { afterEach, beforeEach, vi } from "vitest";
import { business, managedBooking } from "./__tests__/fixtures";
import {
  cancellationSummary,
  contactLine,
  extrasStepDescription,
  formatCountdown,
  paymentModeCopy,
  refundCopy,
  seeYouWhen,
  submitLabel,
} from "./copy";

describe("cancellationSummary", () => {
  it("summarises the cancellation policy", () => {
    expect(cancellationSummary(business.policies, "full", "Lumen")).toBe(
      "Cancel up to 24 hours before for a full refund. Later cancellations are refunded 50%.",
    );
    expect(cancellationSummary(business.policies, "at_venue", "Lumen")).toBe(
      "Free cancellation up to 24 hours before.",
    );
    expect(
      cancellationSummary({ ...business.policies, allowCustomerCancel: false }, "full", "Lumen"),
    ).toMatch(/Contact Lumen/);
  });

  it("words notice periods and late refunds", () => {
    const p = business.policies;
    expect(cancellationSummary({ ...p, cancellationNoticeHours: 0 }, "full", "Lumen")).toBe(
      "Cancel any time before your appointment for a full refund.",
    );
    expect(
      cancellationSummary(
        { ...p, cancellationNoticeHours: 48, lateCancellationRefundPercent: 0 },
        "deposit",
        "L",
      ),
    ).toBe("Cancel up to 2 days before for a full refund. Later cancellations aren't refunded.");
    expect(
      cancellationSummary(
        { ...p, cancellationNoticeHours: 1, lateCancellationRefundPercent: 100 },
        "full",
        "L",
      ),
    ).toBe("Cancel up to 1 hour before for a full refund. Later cancellations are still refunded in full.");
  });
});

describe("refundCopy", () => {
  it("explains the refund a cancellation would give", () => {
    expect(refundCopy(managedBooking())).toBe("You'll get a full refund of €70.");
    expect(
      refundCopy(
        managedBooking({ refundPreview: { amountCents: 3500, reason: "Late cancellation: 50% refund." } }),
      ),
    ).toBe("You'll be refunded €35 of the €70 you paid (late cancellation: 50% refund).");
    expect(refundCopy(managedBooking({ refundPreview: { amountCents: 0, reason: "Too late." } }))).toBe(
      "No refund applies — too late. You paid €70.",
    );
    expect(
      refundCopy(managedBooking({ amountPaidCents: 0, paymentStatus: "pay_at_venue", refundPreview: null })),
    ).toMatch(/nothing to refund/);
    expect(refundCopy(managedBooking({ amountPaidCents: 0, paymentStatus: "pending" }))).toBe(
      "Nothing has been paid yet, so there's nothing to refund.",
    );
  });

  it("counts only what is still paid after earlier refunds", () => {
    const partlyRefunded = { amountPaidCents: 7000, amountRefundedCents: 2000 };
    expect(
      refundCopy(managedBooking({ ...partlyRefunded, refundPreview: { amountCents: 5000, reason: "" } })),
    ).toBe("You'll get a full refund of €50.");
    expect(
      refundCopy(managedBooking({ ...partlyRefunded, refundPreview: { amountCents: 2550, reason: "  " } })),
    ).toBe("You'll be refunded €25.50 of the €50 you paid.");
    expect(refundCopy(managedBooking({ amountRefundedCents: 7000 }))).toMatch(/nothing to refund/);
    expect(refundCopy(managedBooking({ refundPreview: null }))).toBe("No refund applies. You paid €70.");
  });

  it("refunds only what was paid online and says the business settles in-person money", () => {
    // A €20 deposit paid online, the €50 balance paid at the venue.
    const split = { amountPaidCents: 7000, amountPaidInPersonCents: 5000 };
    const inPerson =
      " €50 paid in person isn't refunded online — the business settles that with you directly.";
    expect(refundCopy(managedBooking({ ...split, refundPreview: { amountCents: 2000, reason: "" } }))).toBe(
      `You'll get a full refund of €20.${inPerson}`,
    );
    expect(
      refundCopy(
        managedBooking({ ...split, refundPreview: { amountCents: 1000, reason: "Late cancellation." } }),
      ),
    ).toBe(`You'll be refunded €10 of the €20 you paid online (late cancellation).${inPerson}`);
    expect(refundCopy(managedBooking({ ...split, refundPreview: null }))).toBe(
      `No refund applies. You paid €20 online.${inPerson}`,
    );
    // Paid in full at the venue: nothing comes back online.
    expect(
      refundCopy(
        managedBooking({ amountPaidCents: 7000, amountPaidInPersonCents: 7000, refundPreview: null }),
      ),
    ).toBe(
      "Nothing has been paid online, so there's nothing to refund. €70 paid in person isn't refunded online — the business settles that with you directly.",
    );
  });
});

describe("formatCountdown", () => {
  it("formats the hold countdown", () => {
    expect(formatCountdown(24 * 60_000 + 5_000)).toBe("24:05");
    expect(formatCountdown(500)).toBe("0:01");
  });
});

describe("seeYouWhen", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-05T08:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("says today, tomorrow or the date, in the business timezone", () => {
    expect(seeYouWhen("2026-10-05T13:00:00Z", "Europe/Dublin")).toBe("later today at 14:00");
    expect(seeYouWhen("2026-10-06T08:30:00Z", "Europe/Dublin")).toBe("tomorrow at 09:30");
    expect(seeYouWhen("2026-10-09T08:30:00Z", "Europe/Dublin")).toMatch(/^on Friday/);
  });
});

describe("flow copy", () => {
  it("describes the extras step by what the service offers", () => {
    expect(extrasStepDescription({ options: [1], addons: [1] })).toBe("Choose an option and any extras.");
    expect(extrasStepDescription({ options: [1], addons: [] })).toBe("Choose the option that suits you.");
    expect(extrasStepDescription({ options: [], addons: [1] })).toBe("Add any extras you'd like.");
  });

  it("joins the business's phone and email", () => {
    expect(contactLine({ contactPhone: "+353 1", contactEmail: "a@b.ie" })).toBe("+353 1 or a@b.ie");
    expect(contactLine({ contactPhone: null, contactEmail: "a@b.ie" })).toBe("a@b.ie");
    expect(contactLine({ contactPhone: null, contactEmail: null })).toBe("");
  });
});

describe("payment copy", () => {
  const q = { dueNowCents: 1500, dueLaterCents: 6500 };
  it("explains how paying works", () => {
    expect(paymentModeCopy({ ...q, mode: "free" }, "EUR", "en-IE")).toBeNull();
    expect(paymentModeCopy({ ...q, mode: "full" }, "EUR", "en-IE")).toBe(
      "Paid securely online when you book.",
    );
    expect(paymentModeCopy({ ...q, mode: "deposit" }, "EUR", "en-IE")).toBe(
      "€15 deposit online now, €65 at your appointment.",
    );
    expect(paymentModeCopy({ ...q, mode: "at_venue" }, "EUR", "en-IE")).toBe(
      "Nothing to pay now. Pay at your appointment.",
    );
  });

  it("labels the submit button by what happens next", () => {
    expect(
      submitLabel(
        { requiresApproval: false },
        { mode: "deposit", dueNowCents: 1500, totalCents: 4000 },
        "EUR",
        "en-IE",
        "appointment",
      ),
    ).toBe("Continue to payment · €15");
    expect(
      submitLabel(
        { requiresApproval: true },
        { mode: "at_venue", dueNowCents: 0, totalCents: 2000 },
        "EUR",
        "en-IE",
        "appointment",
      ),
    ).toBe("Send request");
    expect(
      submitLabel(
        { requiresApproval: false },
        { mode: "at_venue", dueNowCents: 0, totalCents: 2000 },
        "EUR",
        "en-IE",
        "appointment",
      ),
    ).toBe("Confirm appointment · €20 at venue");
    expect(
      submitLabel(
        { requiresApproval: false },
        { mode: "free", dueNowCents: 0, totalCents: 0 },
        "EUR",
        "en-IE",
        "appointment",
      ),
    ).toBe("Confirm appointment");
  });
});
