import { afterEach, describe, expect, it } from "vitest";
import { EMPTY_DETAILS } from "./details-schema";
import { clearSavedDetails, loadSavedDetails, saveDetails } from "./details-storage";

const secret = {
  id: "q1",
  label: "Q",
  helpText: null,
  kind: "text" as const,
  options: [],
  required: false,
  sensitive: true,
  sortOrder: 1,
};

afterEach(() => sessionStorage.clear());

describe("saved booking details", () => {
  it("round-trips details per business, without sensitive answers", () => {
    saveDetails("lumen", { name: "Alex", answers: { q1: "private", q2: "fine" } }, [secret]);
    expect(loadSavedDetails("lumen")).toEqual({ ...EMPTY_DETAILS, name: "Alex", answers: { q2: "fine" } });
    expect(loadSavedDetails("other")).toBeNull();
    clearSavedDetails("lumen");
    expect(loadSavedDetails("lumen")).toBeNull();
  });

  it("ignores corrupt storage", () => {
    sessionStorage.setItem("bookanything.booking-details.lumen", "{not json");
    expect(loadSavedDetails("lumen")).toBeNull();
  });
});
