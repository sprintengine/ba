import { describe, expect, it } from "vitest";
import {
  assignableRoles,
  canEditAvailability,
  hasRole,
  permissionsFor,
  roleInfo,
  roleRank,
} from "./permissions";

describe("permissionsFor", () => {
  it("gives owners everything, and the site builder only where business websites are on", () => {
    const p = permissionsFor("owner", { sitesEnabled: true });
    expect(Object.entries(p).filter(([k, val]) => k !== "role" && val !== true)).toEqual([]);
    expect(permissionsFor("owner").manageSite).toBe(false);
    expect(permissionsFor("admin").manageSite).toBe(false);
  });

  it("gives admins everything except payments, billing and owner management", () => {
    const p = permissionsFor("admin", { sitesEnabled: true });
    expect(
      p.manageServices &&
        p.manageTeam &&
        p.viewReports &&
        p.manageSettings &&
        p.manageSite &&
        p.manageCustomerData,
    ).toBe(true);
    expect([p.managePayments, p.manageBilling, p.manageOwners, p.deleteBusiness]).toEqual([
      false,
      false,
      false,
      false,
    ]);
    expect([p.manageOffers, p.manageAssistant, p.bookAnyCalendar]).toEqual([true, true, true]);
  });

  it("limits staff to bookings on their own calendar", () => {
    const p = permissionsFor("staff", { sitesEnabled: true });
    expect(p.manageBookings).toBe(true);
    for (const key of [
      "manageServices",
      "manageResources",
      "manageClosures",
      "manageTeam",
      "viewReports",
      "manageSettings",
      "manageSite",
      "managePayments",
      "manageBilling",
      "manageCustomerData",
      "viewRevenue",
      "manageOffers",
      "manageAssistant",
      "bookAnyCalendar",
      "deleteBusiness",
    ] as const) {
      expect(p[key]).toBe(false);
    }
  });
});

describe("canEditAvailability", () => {
  it("lets admins edit any resource and staff only their linked one", () => {
    expect(canEditAvailability("admin", { memberId: "m2" }, "m1")).toBe(true);
    expect(canEditAvailability("staff", { memberId: "m1" }, "m1")).toBe(true);
    expect(canEditAvailability("staff", { memberId: "m2" }, "m1")).toBe(false);
    expect(canEditAvailability("staff", { memberId: null }, null)).toBe(false);
  });
});

describe("roles", () => {
  it("only owners can hand out ownership", () => {
    expect(assignableRoles("owner")).toContain("owner");
    expect(assignableRoles("admin")).toEqual(["admin", "staff"]);
    expect(assignableRoles("staff")).toEqual([]);
  });
  it("explains roles in the business vocabulary", () => {
    const info = roleInfo((k) => (k === "bookings" ? "lessons" : k));
    expect(info.staff.can.join(" ")).toContain("lessons");
  });
});

describe("role ranks", () => {
  it("orders owner over admin over staff", () => {
    expect(hasRole("owner", "admin")).toBe(true);
    expect(hasRole("staff", "admin")).toBe(false);
    expect(hasRole("admin", "admin")).toBe(true);
    expect((["staff", "owner", "admin"] as const).toSorted((a, b) => roleRank(b) - roleRank(a))).toEqual([
      "owner",
      "admin",
      "staff",
    ]);
  });
});
