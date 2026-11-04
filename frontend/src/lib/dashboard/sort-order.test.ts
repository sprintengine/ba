import { describe, expect, it } from "vitest";
import { nextSortOrder } from "./sort-order";

describe("nextSortOrder", () => {
  it("starts at 0 for an empty list", () => {
    expect(nextSortOrder([])).toBe(0);
  });

  it("is one past the largest, whatever the order or gaps", () => {
    expect(nextSortOrder([{ sortOrder: 0 }, { sortOrder: 1 }])).toBe(2);
    // After a delete: three items, but 3 is taken.
    expect(nextSortOrder([{ sortOrder: 3 }, { sortOrder: 0 }, { sortOrder: 2 }])).toBe(4);
  });

  it("never goes below 0", () => {
    expect(nextSortOrder([{ sortOrder: -2 }])).toBe(0);
  });
});
