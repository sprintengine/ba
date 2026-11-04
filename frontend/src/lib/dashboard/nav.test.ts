import { describe, expect, it } from "vitest";
import { DASHBOARD_SECTIONS, dashboardSectionsFor, sectionVisible, TAB_BAR_KEYS } from "./nav";

const keys = (role: "owner" | "admin" | "staff", sites: boolean) =>
  dashboardSectionsFor(role, sites).map((s) => s.key);

describe("dashboard sections", () => {
  it("shows staff the day-to-day sections only", () => {
    expect(keys("staff", true)).toEqual([
      "overview",
      "calendar",
      "bookings",
      "customers",
      "services",
      "resources",
      "team",
    ]);
  });

  it("shows admins and owners everything, the site only where websites are on", () => {
    expect(keys("admin", true)).toEqual(DASHBOARD_SECTIONS.map((s) => s.key));
    expect(keys("owner", false)).not.toContain("site");
    expect(sectionVisible({ minRole: "admin", requiresSites: true }, "owner", true)).toBe(true);
  });

  it("puts only sections every member sees in the phone tab bar", () => {
    for (const key of TAB_BAR_KEYS) expect(keys("staff", false)).toContain(key);
  });
});
