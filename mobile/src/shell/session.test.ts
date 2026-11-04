import { me as fixtureMe } from "@shared/api/__tests__/fixtures/business";
import type { Me } from "@shared/api/types";
import { homeHref, lastVisit, rememberVisit } from "./session";

const member = (slug: string) => ({ ...fixtureMe.memberships[0]!, slug });

describe("homeHref", () => {
  const me = (patch: Partial<Me>): Me => ({ ...fixtureMe, ...patch });

  it("opens the business last used, if still a member, else the first", () => {
    const two = me({ memberships: [member("a"), member("b")] });
    expect(homeHref(two, { business: "b" })).toBe("/dashboard/b");
    expect(homeHref(two, { business: "gone" })).toBe("/dashboard/a");
    expect(homeHref(two, {})).toBe("/dashboard/a");
  });

  it("opens My bookings for members who last used the customer side, and for customers", () => {
    expect(homeHref(me({ memberships: [member("a")] }), { experience: "customer" })).toBe("/my/bookings");
    expect(homeHref(me({ memberships: [], hasCustomerBookings: true }), {})).toBe("/my/bookings");
  });

  it("sends someone new to Explore", () => {
    expect(homeHref(me({ memberships: [], hasCustomerBookings: false }), {})).toBe("/explore");
  });

  it("remembers the last visit", () => {
    rememberVisit("business", "lumen-physio");
    expect(lastVisit()).toEqual({ business: "lumen-physio", experience: "business" });
    rememberVisit("customer");
    expect(lastVisit()).toEqual({ business: "lumen-physio", experience: "customer" });
  });
});
