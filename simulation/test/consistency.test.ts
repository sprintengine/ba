import { describe, expect, it } from "vitest";
import { compareWithServer, type ServerBooking } from "../src/consistency";
import type { InvariantId } from "../src/invariants";
import type { Sim } from "../src/runtime";
import { World } from "../src/shadow";

function setUp() {
  const world = new World();
  const found: { invariant: InvariantId; message: string }[] = [];
  const sim = {
    world,
    violate: (invariant: InvariantId, message: string) => found.push({ invariant, message }),
  } as unknown as Sim;
  const booking = world.addBooking({
    id: "bk",
    businessId: "biz",
    serviceId: "s",
    reference: "BA-1",
    source: "public",
    status: "confirmed",
    start: "2999-01-01T10:00:00Z",
    end: "2999-01-01T10:30:00Z",
    resourceIds: ["r1"],
    manageToken: "t",
    customerEmail: null,
    priceCents: 1000,
    paidOnlineCents: 1000,
    paidInPersonCents: 0,
    holdExpiresAt: null,
    checkoutUrl: null,
    group: false,
  });
  booking.changedAt = 1_000;
  const server: ServerBooking = {
    status: "confirmed",
    start: "2999-01-01T10:00:00Z",
    end: "2999-01-01T10:30:00Z",
    holdExpiresAt: null,
    amountPaidCents: 1000,
    resources: [{ id: "r2" }],
  };
  return { sim, booking, server, found };
}

describe("compareWithServer", () => {
  it("accepts a booking as the bots left it and takes the server's details without marking it changed", () => {
    const { sim, booking, server, found } = setUp();
    expect(compareWithServer(sim, booking, server, 2_000)).toBe(true);
    expect(found).toEqual([]);
    expect(booking.resourceIds).toEqual(["r2"]);
    expect(booking.changedAt).toBe(1_000);
  });

  it("reports a status, start or payment no bot caused", () => {
    const { sim, booking, server, found } = setUp();
    compareWithServer(
      sim,
      booking,
      { ...server, status: "cancelled", start: "2999-01-01T11:00:00Z", amountPaidCents: 0 },
      2_000,
    );
    expect(found.map((f) => f.invariant)).toEqual([
      "state-consistency",
      "state-consistency",
      "state-consistency",
    ]);
    expect(booking.status).toBe("cancelled");
  });

  it("doesn't judge a read older than the bots' last change, or a booking in use", () => {
    const { sim, booking, server, found } = setUp();
    expect(compareWithServer(sim, booking, { ...server, status: "cancelled" }, 1_000)).toBe(false);
    booking.busy = 1;
    expect(compareWithServer(sim, booking, { ...server, status: "cancelled" }, 5_000)).toBe(false);
    expect(found).toEqual([]);
  });
});
