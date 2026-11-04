import { describe, expect, it } from "vitest";
import type { Booking } from "@shared/api/types";
import { apiOverlaps, refundTotals } from "../src/checker";

function b(
  id: string,
  start: string,
  end: string,
  resources: string[],
  service = "s1",
  status: Booking["status"] = "confirmed",
): Booking {
  return {
    id,
    start,
    end,
    status,
    service: { id: service, name: service, color: "#000" },
    resources: resources.map((r) => ({ id: r, name: r, kind: "person", requirementId: null })),
  } as Booking;
}

describe("apiOverlaps", () => {
  it("finds two one-seat bookings on one resource at once", () => {
    const found = apiOverlaps(
      [
        b("x", "2026-11-04T10:00:00Z", "2026-11-04T10:30:00Z", ["r1"]),
        b("y", "2026-11-04T10:15:00Z", "2026-11-04T10:45:00Z", ["r1", "r2"]),
      ],
      () => 1,
    );
    expect(found.map((p) => p.kind)).toEqual(["no-overlap"]);
  });

  it("ignores touching, released and other resources' bookings", () => {
    expect(
      apiOverlaps(
        [
          b("x", "2026-11-04T10:00:00Z", "2026-11-04T10:30:00Z", ["r1"]),
          b("y", "2026-11-04T10:30:00Z", "2026-11-04T11:00:00Z", ["r1"]),
          b("z", "2026-11-04T10:00:00Z", "2026-11-04T10:30:00Z", ["r1"], "s1", "cancelled"),
          b("w", "2026-11-04T10:00:00Z", "2026-11-04T10:30:00Z", ["r2"]),
        ],
        () => 1,
      ),
    ).toEqual([]);
  });

  it("lets a group session share a resource up to its capacity", () => {
    const seats = ["a", "b", "c"].map((id) =>
      b(id, "2026-11-04T10:00:00Z", "2026-11-04T11:00:00Z", ["room"], "class"),
    );
    expect(apiOverlaps(seats, () => 3)).toEqual([]);
    expect(apiOverlaps(seats, () => 2).map((p) => p.kind)).toEqual(["group-capacity"]);
    const mixed = [
      ...seats.slice(0, 1),
      b("d", "2026-11-04T10:30:00Z", "2026-11-04T11:30:00Z", ["room"], "class"),
    ];
    expect(apiOverlaps(mixed, () => 3).map((p) => p.kind)).toEqual(["no-overlap"]);
  });
});

describe("refundTotals", () => {
  it("adds up every combination of possible refunds", () => {
    expect([...refundTotals([[100], [0, 50]])].sort((x, y) => x - y)).toEqual([100, 150]);
    expect([...refundTotals([])]).toEqual([0]);
  });
});
