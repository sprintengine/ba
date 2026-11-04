/** API types: Me. Import them from `@/lib/api/types`. */
import type { Branding } from "./business";
import type { MemberRole } from "./common";

export type Me = {
  user: { id: string; email: string; name: string | null; emailVerified: boolean };
  memberships: { businessId: string; slug: string; name: string; role: MemberRole; branding: Branding }[];
  pendingInvitations: { token: string; businessName: string; role: string }[];
  hasCustomerBookings: boolean;
};

/** `POST /v1/invitations/{token}/accept`: the refreshed `Me`, and the business joined (among its memberships). */
export type AcceptedInvitation = Me & { joinedBusinessId: string };

export type Membership = Me["memberships"][number];
export type PendingInvitation = Me["pendingInvitations"][number];
