import { describe, expect, it } from "vitest";
import { normName, uniqueKey, uniqueName } from "../keys";

describe("keys and names", () => {
  it("makes slug-like keys that don't collide", () => {
    expect(uniqueKey("Bay 3", [])).toBe("bay-3");
    expect(uniqueKey("Bay 3", ["bay-3", "bay-3-2"])).toBe("bay-3-3");
    expect(uniqueKey("Ćafé!", [])).toBe("cafe");
    expect(uniqueKey("!!!", [], "group")).toBe("group");
    expect(uniqueKey("x".repeat(60), [])).toHaveLength(40);
  });

  it("numbers names that are taken, ignoring case and spaces", () => {
    expect(uniqueName("New group", [])).toBe("New group");
    expect(uniqueName("New group", [" new GROUP ", "New group 2"])).toBe("New group 3");
    expect(normName("  Full Valet ")).toBe("full valet");
  });
});
