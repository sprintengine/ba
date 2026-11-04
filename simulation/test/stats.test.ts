import { describe, expect, it } from "vitest";
import { endpointOf, percentile, Stats } from "../src/stats";

describe("endpointOf", () => {
  it("replaces ids, tokens and slugs", () => {
    expect(
      endpointOf(
        "post",
        "http://localhost:8097/v1/businesses/3f0c9a51-4b8e-4c3e-9a1d-2b7c6d5e4f30/bookings/0e8c9a51-4b8e-4c3e-9a1d-2b7c6d5e4f31/cancel",
      ),
    ).toBe("POST /v1/businesses/{id}/bookings/{id}/cancel");
    expect(endpointOf("GET", "/api/v1/public/manage/abc.def/availability?from=x")).toBe(
      "GET /v1/public/manage/{token}/availability",
    );
    expect(endpointOf("GET", "/v1/public/businesses/sim-abc-b1/availability")).toBe(
      "GET /v1/public/businesses/{slug}/availability",
    );
    expect(endpointOf("POST", "/v1/invitations/tok/accept")).toBe("POST /v1/invitations/{token}/accept");
  });
});

describe("Stats", () => {
  it("computes nearest-rank percentiles", () => {
    expect(percentile([], 50)).toBe(0);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50)).toBe(5);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10);
  });

  it("counts requests, errors and actions", () => {
    const stats = new Stats();
    stats.recordRequest("GET /a", 200, 10);
    stats.recordRequest("GET /a", 500, 30);
    stats.recordRequest("GET /b", 0, 5);
    stats.recordAction("customer.book", "confirmed");
    stats.recordAction("customer.book", "confirmed");
    stats.recordAction("customer.book", "slot_unavailable");
    stats.recordAction("owner.approve", "approved");
    expect(stats.requests).toBe(3);
    expect(stats.actionCount()).toBe(4);
    expect(stats.statusCounts()).toEqual({ "0": 1, "200": 1, "500": 1 });
    expect(stats.latencyRows()[0]).toMatchObject({
      endpoint: "GET /a",
      count: 2,
      p50: 10,
      p95: 30,
      max: 30,
      errors: 1,
    });
    expect(stats.actionRows()[0]).toEqual({
      kind: "customer.book",
      total: 3,
      outcomes: { confirmed: 2, slot_unavailable: 1 },
    });
  });
});
