import { describe, expect, it } from "vitest";
import { must } from "@/test/must";
import { createDraft } from "../draft";
import { durationLabel, priceLabel } from "@/lib/booking/quote";
import { hasPaidServices } from "../summary";
import { fixture } from "./fixture";

const setup = () => createDraft(fixture()).setup;

describe("service summaries", () => {
  it("labels price and duration, with ranges when options differ", () => {
    const [wash, valet] = setup().services;
    expect(priceLabel(must(wash, "wash"), "EUR")).toBe("€15");
    expect(durationLabel(must(wash, "wash"))).toBe("30 min");
    expect(priceLabel(must(valet, "valet"), "EUR")).toBe("from €60");
    expect(durationLabel(must(valet, "valet"))).toBe("1 h 30 min – 2 h 30 min");
    expect(priceLabel({ ...must(wash, "wash"), paymentMode: "free" }, "EUR")).toBe("Free");
    const sameOptions = {
      ...must(valet, "valet"),
      options: must(valet, "valet").options.map((o) => ({ ...o, priceCents: 5000, durationMinutes: 60 })),
    };
    expect(priceLabel(sameOptions, "EUR")).toBe("€50");
    expect(durationLabel(sameOptions)).toBe("1 h");
  });

  it("knows whether any service takes money online", () => {
    const s = setup();
    expect(hasPaidServices(s)).toBe(true);
    const atVenue = s.services.map((x) => ({ ...x, paymentMode: "at_venue" as const }));
    expect(hasPaidServices({ ...s, services: atVenue })).toBe(false);
    const freeButAddon = [
      {
        ...must(s.services[0], "wash"),
        priceCents: 0,
        addons: [{ name: "Wax", description: null, extraMinutes: 10, priceCents: 500, sortOrder: 0 }],
      },
    ];
    expect(hasPaidServices({ ...s, services: freeButAddon })).toBe(true);
  });
});
