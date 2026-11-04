import { CUSTOMER_NAV, businessNav, moreItems, phoneTabs, sidebarItems } from "./nav";

const keys = (items: { key: string }[]) => items.map((i) => i.key);

describe("customer navigation", () => {
  it("has four phone tabs, all in the sidebar too", () => {
    expect(keys(phoneTabs(CUSTOMER_NAV))).toEqual(["explore", "bookings", "approvals", "account"]);
    expect(keys(sidebarItems(CUSTOMER_NAV))).toEqual(keys(CUSTOMER_NAV));
  });
});

describe("business navigation", () => {
  const nav = (role: "owner" | "admin" | "staff", sitesEnabled = true) =>
    businessNav({ slug: "lumen-physio", role, sitesEnabled });

  it("shows staff the website's staff sections, plus Approvals and More", () => {
    expect(keys(nav("staff"))).toEqual([
      "overview",
      "calendar",
      "bookings",
      "customers",
      "services",
      "resources",
      "team",
      "approvals",
      "more",
    ]);
  });

  it("shows admins everything, Approvals before Settings, the site only with websites on", () => {
    const admin = keys(nav("admin"));
    expect(admin).toContain("offers");
    expect(admin.indexOf("approvals")).toBe(admin.indexOf("settings") - 1);
    expect(keys(nav("owner", false))).not.toContain("site");
  });

  it("puts the website's tab bar sections and More in the phone tab bar; More only on phones", () => {
    const items = nav("owner");
    expect(keys(phoneTabs(items))).toEqual(["overview", "calendar", "bookings", "customers", "more"]);
    expect(keys(sidebarItems(items))).not.toContain("more");
    expect(keys(moreItems(items))).toEqual([
      "services",
      "offers",
      "resources",
      "team",
      "site",
      "reports",
      "approvals",
      "settings",
    ]);
  });

  it("links into the business and names sections in its own words", () => {
    const items = businessNav({
      slug: "lumen-physio",
      role: "staff",
      sitesEnabled: false,
      vocabulary: { customers: "patients", bookings: "appointments" },
    });
    const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
    expect(byKey.overview?.href).toBe("/dashboard/lumen-physio");
    expect(byKey.customers?.href).toBe("/dashboard/lumen-physio/customers");
    expect(byKey.customers?.label).toBe("Patients");
    expect(byKey.bookings?.label).toBe("Appointments");
    expect(byKey.overview?.label).toBe("Today");
  });
});
