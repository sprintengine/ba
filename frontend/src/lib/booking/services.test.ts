import { describe, expect, it } from "vitest";
import { assessment, consult, massage } from "./__tests__/fixtures";
import { findService, groupByCategory, servicesForGroup } from "./services";

describe("services", () => {
  it("finds a service by id", () => {
    expect(findService([assessment, massage], "s2")).toBe(massage);
    expect(findService([assessment], "nope")).toBeNull();
    expect(findService([assessment], null)).toBeNull();
  });

  it("shows group-restricted services only to that group", () => {
    const restricted = { ...consult, allowedGroupIds: ["g1"] };
    expect(servicesForGroup([restricted, assessment], null)).toEqual([assessment]);
    expect(servicesForGroup([restricted, assessment], "g1")).toEqual([restricted, assessment]);
  });

  it("groups services by category, uncategorised last", () => {
    expect(groupByCategory([consult, massage, assessment]).map((g) => g.category)).toEqual([
      "Physiotherapy",
      "Massage",
      "Other",
    ]);
    expect(groupByCategory([{ ...consult, category: null }]).map((g) => g.category)).toEqual([null]);
  });
});
