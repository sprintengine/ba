import { describe, expect, it } from "vitest";
import { ApiError } from "./client";
import { shouldRetryQuery } from "./query-defaults";

describe("shouldRetryQuery", () => {
  it("never retries a client error", () => {
    expect(shouldRetryQuery(0, new ApiError(404, "NOT_FOUND", "x"))).toBe(false);
  });

  it("retries network failures and 5xx twice", () => {
    const down = new ApiError(0, "NETWORK_ERROR", "x");
    expect(shouldRetryQuery(0, down)).toBe(true);
    expect(shouldRetryQuery(1, new ApiError(503, "SERVICE_UNAVAILABLE", "x"))).toBe(true);
    expect(shouldRetryQuery(2, down)).toBe(false);
    expect(shouldRetryQuery(0, new Error("boom"))).toBe(true);
  });
});
