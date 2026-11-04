import { describe, expect, it } from "vitest";
import { calendarOf, ruleInputs, selfTransitions, World, type SimBusiness } from "../src/shadow";

const booking = (id: string, businessId = "b1") => ({
  id,
  businessId,
  serviceId: "s1",
  reference: "BA-1",
  source: "public" as const,
  status: "held" as const,
  start: "2026-11-04T10:00:00Z",
  end: "2026-11-04T10:30:00Z",
  resourceIds: ["r1"],
  manageToken: "tok",
  customerEmail: "c@example.test",
  priceCents: 1000,
  paidOnlineCents: 0,
  paidInPersonCents: 0,
  holdExpiresAt: null,
  checkoutUrl: null,
  group: false,
});

describe("World", () => {
  it("keeps bookings in creation order and once each", () => {
    const w = new World();
    const a = w.addBooking(booking("a"));
    w.addBooking(booking("b", "b2"));
    expect(w.addBooking(booking("a"))).toBe(a);
    expect(w.bookings().map((x) => x.n)).toEqual([1, 2]);
    expect(w.bookingsOf("b2").map((x) => x.id)).toEqual(["b"]);
    expect(w.booking("a")).toBe(a);
    w.sync(a, {
      status: "confirmed",
      start: "2026-11-04T11:00:00Z",
      end: "2026-11-04T11:30:00Z",
      holdExpiresAt: null,
      resourceIds: ["r2"],
    });
    expect(a).toMatchObject({ status: "confirmed", start: "2026-11-04T11:00:00Z", resourceIds: ["r2"] });
  });

  it("marks bookings busy and configurations changing while work is in flight", async () => {
    const w = new World();
    const a = w.addBooking(booking("a"));
    const seen = await w.working(a, () => Promise.resolve(a.busy));
    expect(seen).toBe(1);
    expect(a.busy).toBe(0);
    const biz = { id: "b1", configVersion: 0, configBusy: 0, dormant: false } as SimBusiness;
    w.addBusiness(biz);
    expect(w.business("b1")).toBe(biz);
    expect(w.liveBookings().map((x) => x.id)).toEqual(["a"]);
    biz.dormant = true;
    expect(w.liveBookings()).toEqual([]);
    await expect(
      w.configuring(biz, () => {
        expect(biz.configBusy).toBe(1);
        return Promise.reject(new Error("refused"));
      }),
    ).rejects.toThrow("refused");
    expect(biz).toMatchObject({ configBusy: 0, configVersion: 2 });
  });
});

describe("shadow helpers", () => {
  it("knows what a booking may become on its own", () => {
    expect(selfTransitions("held", "2026-01-01T00:00:00Z", Date.now())).toEqual(["held", "expired"]);
    expect(selfTransitions("confirmed", "2000-01-01T00:00:00Z", Date.now())).toEqual([
      "confirmed",
      "completed",
    ]);
    expect(selfTransitions("confirmed", "2999-01-01T00:00:00Z", Date.now())).toEqual(["confirmed"]);
    expect(selfTransitions("cancelled", "2000-01-01T00:00:00Z", Date.now())).toEqual(["cancelled"]);
  });

  it("converts rules and calendars", () => {
    expect(ruleInputs([{ dayOfWeek: 2, startTime: "09:00", endTime: "17:00" }])).toEqual([
      {
        dayOfWeek: 2,
        startTime: "09:00",
        endTime: "17:00",
        validFrom: null,
        validUntil: null,
        audienceGroupIds: [],
      },
    ]);
    const o = { date: "2026-11-04", isAvailable: false, startTime: null, endTime: null };
    expect(
      calendarOf({
        id: "r",
        name: "R",
        active: true,
        rules: [],
        overrideIds: new Map([["o1", o]]),
        memberId: null,
      }),
    ).toEqual({
      id: "r",
      active: true,
      rules: [],
      overrides: [o],
    });
  });
});
