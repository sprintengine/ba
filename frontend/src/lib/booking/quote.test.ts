import { describe, expect, it } from "vitest";
import { assessment, consult, massage } from "./__tests__/fixtures";
import {
  durationLabel,
  durationRange,
  paymentSplit,
  payingAtVenue,
  priceLabel,
  priceRange,
  priceSummary,
  quote,
  quoteFor,
  withSlotOffer,
  type PricedService,
} from "./quote";

const deal = {
  id: "of1",
  name: "Quiet Tuesdays",
  label: "20% off",
  originalPriceCents: 8000,
  priceCents: 6000,
};

describe("quote", () => {
  it("adds option and add-ons; deposit is due now, the rest later", () => {
    const q = quote(massage, "o2", ["a1"]);
    expect(q.totalCents).toBe(8000);
    expect(q.durationMinutes).toBe(70);
    expect(q.mode).toBe("deposit");
    expect(q.dueNowCents).toBe(1500);
    expect(q.dueLaterCents).toBe(6500);
  });

  it("free when the total is zero; nothing due now at venue", () => {
    expect(quote(consult, null, []).mode).toBe("free");
    expect(quote(assessment, null, []).dueNowCents).toBe(0);
    expect(quote({ ...assessment, paymentMode: "full" }, null, []).dueNowCents).toBe(7000);
  });

  it("applies a cheaper slot deal to the total and what is due", () => {
    const q = withSlotOffer(quote(massage, "o2", ["a1"]), massage, deal);
    expect(q.totalCents).toBe(6000);
    expect(q.deal).toEqual({
      name: "Quiet Tuesdays",
      label: "20% off",
      originalTotalCents: 8000,
      discountCents: 2000,
    });
    expect(q.dueLaterCents).toBe(4500);
  });

  it("ignores a missing or more expensive deal", () => {
    const q = quote(massage, "o2", ["a1"]);
    expect(withSlotOffer(q, massage, null)).toBe(q);
    expect(withSlotOffer(q, massage, { ...deal, priceCents: 9000 })).toBe(q);
  });

  it("ignores unknown option and add-on ids", () => {
    expect(quote(massage, "nope", ["nope"])).toEqual(quote(massage, null, []));
  });
});

describe("paying at the venue instead", () => {
  it("leaves nothing due now and the whole total at the appointment", () => {
    const online = quoteFor(
      { name: "Massage", durationMinutes: 60, paymentMode: "deposit", depositCents: 2000, priceCents: 5000 },
      null,
      [],
    );
    expect(online).toMatchObject({ mode: "deposit", dueNowCents: 2000 });
    expect(payingAtVenue(online)).toMatchObject({
      mode: "at_venue",
      totalCents: 5000,
      dueNowCents: 0,
      dueLaterCents: 5000,
    });
  });

  it("keeps a free quote free", () => {
    expect(
      payingAtVenue(
        quoteFor(
          { name: "Massage", durationMinutes: 60, paymentMode: "full", depositCents: null, priceCents: 0 },
          null,
          [],
        ),
      ).mode,
    ).toBe("free");
  });
});

describe("payment split", () => {
  it("charges the deposit (never more than the total) now and the rest later", () => {
    expect(paymentSplit({ paymentMode: "deposit", depositCents: 2000 }, 5000)).toEqual({
      mode: "deposit",
      dueNowCents: 2000,
      dueLaterCents: 3000,
    });
    expect(paymentSplit({ paymentMode: "deposit", depositCents: 2000 }, 1500).dueNowCents).toBe(1500);
    // Like the backend: a deposit service without an amount charges the whole price.
    expect(paymentSplit({ paymentMode: "deposit", depositCents: null }, 1500).dueNowCents).toBe(1500);
  });

  it("is free whenever the total is zero", () => {
    expect(paymentSplit({ paymentMode: "full" }, 0)).toEqual({
      mode: "free",
      dueNowCents: 0,
      dueLaterCents: 0,
    });
    expect(paymentSplit({ paymentMode: "at_venue" }, 4000)).toEqual({
      mode: "at_venue",
      dueNowCents: 0,
      dueLaterCents: 4000,
    });
  });
});

/** A service as onboarding or the marketing pages describe it: no ids, options and add-ons optional. */
const example: PricedService = {
  name: "Valet",
  priceCents: 6000,
  durationMinutes: 90,
  paymentMode: "deposit",
  depositCents: 2000,
  options: [
    { name: "Small car", priceCents: 6000, durationMinutes: 90 },
    { name: "SUV", priceCents: 8000, durationMinutes: 120 },
  ],
  addons: [{ name: "Wax", priceCents: 1500, extraMinutes: 20 }],
};

describe("quoteFor (any service shape)", () => {
  it("prices a chosen option and add-ons", () => {
    const q = quoteFor(example, example.options?.[1] ?? null, example.addons ?? []);
    expect(q).toMatchObject({
      totalCents: 9500,
      durationMinutes: 140,
      dueNowCents: 2000,
      dueLaterCents: 7500,
    });
    expect(q.lines).toEqual([
      { label: "Valet · SUV", cents: 8000, minutes: 120 },
      { label: "Wax", cents: 1500, minutes: 20 },
    ]);
  });

  it("uses the service's own price without an option", () => {
    expect(
      quoteFor({ name: "Wash", priceCents: 1500, durationMinutes: 30, paymentMode: "full" }, null, []),
    ).toMatchObject({ totalCents: 1500, durationMinutes: 30, mode: "full", dueNowCents: 1500 });
  });
});

describe("price and duration labels", () => {
  it("summarises the price across options", () => {
    expect(priceSummary(massage)).toEqual({ kind: "from", cents: 4000 });
    expect(priceSummary(assessment)).toEqual({ kind: "fixed", cents: 7000 });
    expect(priceSummary(consult)).toEqual({ kind: "free" });
    expect(
      priceSummary({ priceCents: 0, options: [{ name: "A", priceCents: 0, durationMinutes: 30 }] }),
    ).toEqual({
      kind: "free",
    });
    expect(priceRange(example)).toEqual({ min: 6000, max: 8000 });
  });

  it("labels prices: Free, one price, or from the cheapest", () => {
    expect(priceLabel(consult, "EUR")).toBe("Free");
    expect(priceLabel(assessment, "EUR")).toBe("€70");
    expect(priceLabel(example, "EUR")).toBe("from €60");
    expect(priceLabel(example, "EUR", { capitalize: true })).toBe("From €60");
    expect(priceLabel({ priceCents: 4550, options: [] }, "EUR")).toBe("€45.50");
  });

  it("reads a free cheapest option as from €0, never from Free", () => {
    const options = [
      { name: "Taster", priceCents: 0, durationMinutes: 15 },
      { name: "Full", priceCents: 6000, durationMinutes: 60 },
    ];
    expect(priceSummary({ priceCents: 0, options })).toEqual({ kind: "from", cents: 0 });
    expect(priceLabel({ priceCents: 0, options }, "EUR")).toBe("from €0");
    expect(priceLabel({ priceCents: 0, options }, "EUR", { capitalize: true })).toBe("From €0");
  });

  it("shows one price when every option costs the same", () => {
    const options = [
      { name: "A", priceCents: 5000, durationMinutes: 60 },
      { name: "B", priceCents: 5000, durationMinutes: 60 },
    ];
    expect(priceLabel({ priceCents: 0, options }, "EUR")).toBe("€50");
    expect(durationLabel({ durationMinutes: 30, options })).toBe("1 h");
  });

  it("reads Free while the service is set to free, whatever prices the editor still holds", () => {
    expect(priceLabel({ priceCents: 4000, options: [], paymentMode: "free" }, "EUR")).toBe("Free");
    expect(priceLabel({ priceCents: 4000, options: [], paymentMode: "at_venue" }, "EUR")).toBe("€40");
  });

  it("spans the options' durations", () => {
    expect(durationRange(assessment)).toEqual({ min: 60, max: 60 });
    expect(durationRange(example)).toEqual({ min: 90, max: 120 });
    expect(durationLabel(assessment)).toBe("1 h");
    expect(durationLabel(example)).toBe("1 h 30 min – 2 h");
  });
});

describe("what is paid when, with deals (mirrors the backend's BookingQuote.dueOnline)", () => {
  const offer = (priceCents: number) => ({ ...deal, originalPriceCents: 8000, priceCents });

  it("a deal under the deposit takes only the deal price now, and nothing later", () => {
    // massage: deposit €15; the 60 min option with cupping lists at €80.
    const q = withSlotOffer(quote(massage, "o2", ["a1"]), massage, offer(1000));
    expect(q).toMatchObject({ mode: "deposit", totalCents: 1000, dueNowCents: 1000, dueLaterCents: 0 });
    expect(q.deal?.discountCents).toBe(7000);
  });

  it("prices the deal over the option and add-ons together, keeping their lines and length", () => {
    const listed = quote(massage, "o2", ["a1"]);
    const q = withSlotOffer(listed, massage, offer(6400));
    expect(q.lines).toEqual(listed.lines);
    expect(q.durationMinutes).toBe(70);
    expect(q.basePriceCents).toBe(7000);
    expect(q.addonsCents).toBe(1000);
    expect(q.deal).toMatchObject({ originalTotalCents: 8000, discountCents: 1600 });
  });

  it("a full-payment service charges the deal price now", () => {
    const full = { ...assessment, paymentMode: "full" as const };
    expect(withSlotOffer(quote(full, null, []), full, offer(5600))).toMatchObject({
      mode: "full",
      totalCents: 5600,
      dueNowCents: 5600,
      dueLaterCents: 0,
    });
  });

  it("pay-at-venue stays at the venue, at the deal price", () => {
    expect(withSlotOffer(quote(assessment, null, []), assessment, offer(5600))).toMatchObject({
      mode: "at_venue",
      dueNowCents: 0,
      dueLaterCents: 5600,
    });
  });

  it("a 100% deal makes the booking free: nothing to pay online or later", () => {
    const full = { ...assessment, paymentMode: "full" as const };
    const q = withSlotOffer(quote(full, null, []), full, offer(0));
    expect(q).toMatchObject({ mode: "free", totalCents: 0, dueNowCents: 0, dueLaterCents: 0 });
    expect(q.deal?.discountCents).toBe(7000);
  });

  it("never goes below zero, even if a deal price were negative", () => {
    const q = withSlotOffer(quote(assessment, null, []), assessment, offer(-500));
    expect(q.totalCents).toBe(0);
    expect(q.deal?.discountCents).toBe(7000);
  });

  it("ignores a deal that saves nothing, and any deal on a free service", () => {
    const listed = quote(assessment, null, []);
    expect(withSlotOffer(listed, assessment, offer(7000))).toBe(listed);
    expect(withSlotOffer(listed, assessment, undefined)).toBe(listed);
    const free = quote(consult, null, []);
    expect(withSlotOffer(free, consult, offer(0))).toBe(free);
  });

  it("works in whole cents: the split always adds back up to the total", () => {
    for (const total of [1, 99, 1001, 4999, 12345]) {
      for (const depositCents of [1, 50, 1500, null]) {
        const split = paymentSplit({ paymentMode: "deposit", depositCents }, total);
        expect(split.dueNowCents + split.dueLaterCents).toBe(total);
        expect(Number.isInteger(split.dueNowCents)).toBe(true);
        expect(split.dueNowCents).toBeLessThanOrEqual(total);
      }
    }
  });

  it("charges nothing online for a service marked free that somehow has a price", () => {
    expect(paymentSplit({ paymentMode: "free" }, 1500)).toEqual({
      mode: "free",
      dueNowCents: 0,
      dueLaterCents: 1500,
    });
  });
});
