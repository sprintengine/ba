import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { Me } from "@/lib/api/types";
import { invitationErrorView, joinedHref, joinedMembership } from "./invitation-state";

const membership = (businessId: string) => ({
  businessId,
  slug: `biz-${businessId}`,
  name: `Business ${businessId}`,
  role: "staff" as const,
  branding: { primaryColor: "#0f766e", logoUrl: null, coverImageUrl: null },
});
const me = (...ids: string[]): Me => ({
  user: { id: "u1", email: "rowan@example.test", name: "Rowan", emailVerified: true },
  memberships: ids.map(membership),
  pendingInvitations: [],
  hasCustomerBookings: false,
});

describe("joinedMembership", () => {
  it("finds the business the invitation was for, also when it was joined before", () => {
    expect(joinedMembership({ ...me("b1", "b2"), joinedBusinessId: "b2" })?.slug).toBe("biz-b2");
    expect(joinedMembership({ ...me("b1"), joinedBusinessId: "b1" })?.slug).toBe("biz-b1");
    expect(joinedMembership({ ...me("b1"), joinedBusinessId: "b9" })).toBeNull();
  });

  it("links to that business's dashboard", () => {
    expect(joinedHref("biz-b2")).toBe("/dashboard/biz-b2");
    expect(joinedHref(null)).toBe("/dashboard");
  });
});

describe("invitationErrorView", () => {
  const notFound = new ApiError(404, "NOT_FOUND", "Invitation not found.");

  it("tells members the invitation was used by someone else or withdrawn (it doesn't expire)", () => {
    const view = invitationErrorView(notFound, { hasAccess: true, email: "a@b.ie" });
    expect(view).toMatchObject({
      title: "This invitation isn't valid anymore",
      next: "dashboard",
      offerOtherAccount: false,
    });
    expect(view.body).toContain("used by another account or withdrawn");
    expect(view.body).not.toMatch(/expired/);
  });

  it("suggests another account to non-members", () => {
    const view = invitationErrorView(notFound, { hasAccess: false, email: "a@b.ie" });
    expect(view).toMatchObject({
      title: "This invitation isn't valid anymore",
      next: "bookings",
      offerOtherAccount: true,
    });
    expect(view.body).toContain("a different email than a@b.ie");
    expect(view.body).not.toMatch(/expired/);
    expect(invitationErrorView(notFound, { hasAccess: false, email: null }).body).toContain(
      "the one you're signed in with",
    );
  });

  it("handles an existing membership and a full team", () => {
    expect(
      invitationErrorView(new ApiError(409, "CONFLICT", "Already a member."), {
        hasAccess: false,
        email: null,
      }),
    ).toEqual({
      title: "You're already on the team",
      body: "Already a member.",
      next: "dashboard",
      offerOtherAccount: false,
    });
    expect(
      invitationErrorView(new ApiError(409, "PLAN_LIMIT_REACHED", "Upgrade to add members."), {
        hasAccess: false,
        email: null,
      }),
    ).toEqual({
      title: "The team is full",
      body: "Upgrade to add members.",
      next: "bookings",
      offerOtherAccount: true,
    });
  });

  it("falls back to the server's message", () => {
    expect(invitationErrorView(new Error("boom"), { hasAccess: true, email: null })).toMatchObject({
      title: "We couldn't accept this invitation",
      next: "dashboard",
    });
  });
});
