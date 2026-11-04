import { service } from "@shared/api/__tests__/fixtures/catalog";
import { offer, offerSparse } from "@shared/api/__tests__/fixtures/offers";
import type { Offer, Service } from "@shared/api/types";
import {
  DAY_PRESETS,
  editorServices,
  isPreset,
  nextTimeWindow,
  offerCardLabel,
  serviceNames,
  sortOffers,
  validDates,
} from "./offers";

const svc = (id: string, name: string, patch: Partial<Service> = {}): Service => ({
  ...service,
  id,
  name,
  ...patch,
});

describe("offers helpers", () => {
  it("sorts running deals first, then by name", () => {
    const a: Offer = { ...offer, id: "a", name: "Zeta" };
    const b: Offer = { ...offer, id: "b", name: "Alpha", status: "paused" };
    const c: Offer = { ...offer, id: "c", name: "Beta" };
    expect(sortOffers([a, b, c]).map((o) => o.id)).toEqual(["c", "a", "b"]);
    expect(sortOffers(undefined)).toEqual([]);
  });

  it("names the services a deal covers, briefly", () => {
    const list = [svc("1", "One"), svc("2", "Two"), svc("3", "Three"), svc("4", "Four")];
    expect(serviceNames(["1"], list)).toBe("One");
    expect(serviceNames(["1", "2"], list)).toBe("One, Two");
    expect(serviceNames(["1", "2", "3", "4"], list)).toBe("One, Two +2 more");
    expect(serviceNames(["x"], [])).toBe("1 service");
    expect(serviceNames(["x", "y"], [])).toBe("2 services");
  });

  it("says when a deal runs", () => {
    const date = (d: string) => `<${d}>`;
    expect(validDates(offer, date)).toBe("<2026-10-01> – <2026-12-31>");
    expect(validDates({ validFrom: "2026-10-01", validUntil: null }, date)).toBe("From <2026-10-01>");
    expect(validDates({ validFrom: null, validUntil: "2026-12-31" }, date)).toBe("Until <2026-12-31>");
    expect(validDates(offerSparse, date)).toBeNull();
  });

  it("edits with active services, keeping inactive ones the deal already has", () => {
    const active = svc("a", "Active");
    const inactive = svc("i", "Inactive", { isActive: false });
    expect(editorServices([active, inactive], null)).toEqual([active]);
    expect(editorServices([active, inactive], { ...offer, serviceIds: ["i"] })).toEqual([active, inactive]);
    expect(editorServices(undefined, null)).toEqual([]);
  });

  it("reads a card as one sentence", () => {
    expect(
      offerCardLabel({
        offer,
        services: [svc(offer.serviceIds[0]!, "Initial assessment")],
        today: "2026-10-15",
        date: (d) => d,
      }),
    ).toBe(
      "Quiet Tuesdays, 20% off, Active. Off-peak: Tue, 13:00–17:00. Initial assessment. 3 of 50 used. 2026-10-01 – 2026-12-31",
    );
    expect(
      offerCardLabel({
        offer: { ...offerSparse, status: "paused" },
        services: [],
        today: "2026-10-15",
        date: (d) => d,
      }),
    ).toBe("Quiet Tuesdays, €5 off, Paused. Always on: Tue, 13:00–17:00. 1 service. 3 used");
  });

  it("adds the next time window after the last one, or in the afternoon", () => {
    expect(nextTimeWindow([])).toEqual({ start: "13:00", end: "17:00" });
    expect(nextTimeWindow([{ start: "09:00", end: "11:30" }])).toEqual({ start: "11:30", end: "13:30" });
    expect(nextTimeWindow([{ start: "17:00", end: "21:00" }])).toEqual({ start: "13:00", end: "17:00" });
    expect(nextTimeWindow([{ start: "18:00", end: "19:30" }])).toEqual({ start: "19:30", end: "21:30" });
    expect(nextTimeWindow([{ start: "09:00", end: null }])).toEqual({ start: "13:00", end: "17:00" });
  });

  it("recognises the day presets in any order", () => {
    const [weekdays, weekends, every] = DAY_PRESETS;
    expect(isPreset([5, 4, 3, 2, 1], weekdays.days)).toBe(true);
    expect(isPreset([6], weekends.days)).toBe(false);
    expect(isPreset([], every.days)).toBe(true);
    expect(isPreset([1], every.days)).toBe(false);
  });
});
