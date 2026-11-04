import { describe, expect, it } from "vitest";
import { depositProblem } from "./services";

const deposit = (priceCents: number, depositCents: number | null) =>
  depositProblem({ paymentMode: "deposit", priceCents, depositCents });

describe("depositProblem", () => {
  it("needs a deposit above zero in deposit mode", () => {
    expect(deposit(5000, null)).toBe("Enter the deposit amount");
    expect(deposit(5000, 0)).toBe("Enter the deposit amount");
  });

  it("takes a deposit up to the service's own price, as the backend does", () => {
    expect(deposit(5000, 1000)).toBeNull();
    expect(deposit(5000, 5000)).toBeNull();
    expect(deposit(5000, 5001)).toBe("The deposit can't be more than the price");
    // Options don't count: the backend compares with the base price.
    expect(deposit(0, 1000)).toBe("The deposit can't be more than the price");
  });

  it("ignores the deposit in other modes unless it's negative", () => {
    for (const paymentMode of ["full", "at_venue", "free"]) {
      expect(depositProblem({ paymentMode, priceCents: 5000, depositCents: 9000 })).toBeNull();
      expect(depositProblem({ paymentMode, priceCents: 5000, depositCents: null })).toBeNull();
      expect(depositProblem({ paymentMode, priceCents: 5000, depositCents: -1 })).toBe(
        "Must not be negative",
      );
    }
  });
});
