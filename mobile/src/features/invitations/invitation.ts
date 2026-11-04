/**
 * What the invitation screen shows, from the acceptance's outcome (the website's invitation-state.ts, whose module
 * imports a website component, so it can't be shared). Pure; tested in invitation.test.tsx.
 */
import { errorMessage, isApiError } from "@shared/api/client";
import type { AcceptedInvitation, Membership } from "@shared/api/types";

/** The business the invitation was for, among the memberships (null if it isn't listed: a suspended business). */
export function joinedMembership(accepted: AcceptedInvitation): Membership | null {
  return accepted.memberships.find((m) => m.businessId === accepted.joinedBusinessId) ?? null;
}

/** Where to go after joining: the business, or the business chooser when it isn't known. */
export function joinedHref(slug: string | null): `/dashboard${string}` {
  return slug ? `/dashboard/${slug}` : "/dashboard";
}

export type InvitationErrorView = {
  title: string;
  body: string;
  /** The way out: the dashboard (already a member) or the person's bookings. */
  next: "dashboard" | "bookings";
  /** Offer signing in with another account (the invitation may be for a different email). */
  offerOtherAccount: boolean;
};

export function invitationErrorView(
  error: unknown,
  { hasAccess, email }: { hasAccess: boolean; email: string | null },
): InvitationErrorView {
  const code = isApiError(error) ? error.code : null;
  const fallback: InvitationErrorView = {
    title: "We couldn't accept this invitation",
    body: errorMessage(error),
    next: hasAccess ? "dashboard" : "bookings",
    offerOtherAccount: !hasAccess,
  };
  if (code === "CONFLICT") {
    return { ...fallback, title: "You're already on the team", next: "dashboard", offerOtherAccount: false };
  }
  // Invitations don't expire: a link that worked once still answers the account that joined through it.
  if (isApiError(error) && error.isNotFound) {
    return {
      ...fallback,
      title: "This invitation isn't valid anymore",
      body: hasAccess
        ? "It was used by another account or withdrawn. Ask the person who invited you to send a new one if you still need to join."
        : `It may have been withdrawn or used by another account, or it was sent to a different email than ${email ?? "the one you're signed in with"}. Ask the person who invited you to send a new one.`,
    };
  }
  if (code === "PLAN_LIMIT_REACHED") return { ...fallback, title: "The team is full" };
  return fallback;
}
