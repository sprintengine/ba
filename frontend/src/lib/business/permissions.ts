/**
 * What each role may do in the dashboard (architecture §3.3). The backend
 * enforces all of this too; the UI uses it to hide or explain unavailable
 * actions instead of letting people hit a 403.
 */
import type { MemberRole } from "@/lib/api/types";
import type { VocabularyKey } from "@/lib/vocabulary";

const RANK: Record<MemberRole, number> = { staff: 1, admin: 2, owner: 3 };

/** A role's rank for sorting (owner first when sorted descending). */
export function roleRank(role: MemberRole): number {
  return RANK[role];
}

/** Does `role` include `required`? (owner ⊃ admin ⊃ staff) Use it for role-ranked lists (nav `minRole`). */
export function hasRole(role: MemberRole, required: MemberRole): boolean {
  return RANK[role] >= RANK[required];
}

export type DashboardPermissions = {
  role: MemberRole;
  /** Create/cancel/reschedule bookings (staff: on their own resources — enforced server-side). */
  manageBookings: boolean;
  /** Choose which resources a booking uses; staff always book onto their own calendar (the backend picks it). */
  bookAnyCalendar: boolean;
  /** Services: create, edit, toggle, delete. */
  manageServices: boolean;
  /** Resources: create, edit, delete; edit anyone's availability. */
  manageResources: boolean;
  /** Business-wide closures. */
  manageClosures: boolean;
  /** Invite, change roles, remove members. */
  manageTeam: boolean;
  /** Make someone an owner / change an owner. */
  manageOwners: boolean;
  viewReports: boolean;
  manageSettings: boolean;
  /** The public site: themes, sections, AI changes, publishing (§15). Never where websites are off. */
  manageSite: boolean;
  /** Stripe Connect. */
  managePayments: boolean;
  /** bookanything plan. */
  manageBilling: boolean;
  /** GDPR export / erase. */
  manageCustomerData: boolean;
  /** Revenue figures (the API returns 0 to staff). */
  viewRevenue: boolean;
  /** Deals and offers (§19). */
  manageOffers: boolean;
  /** Bo's business memory and dismissing its nudges (§17). */
  manageAssistant: boolean;
  /** Delete (suspend) the business. */
  deleteBusiness: boolean;
};

/** [role]'s permissions; the site builder needs business websites to be on as well (`Business.sitesEnabled`). */
export function permissionsFor(
  role: MemberRole,
  { sitesEnabled = false }: { sitesEnabled?: boolean } = {},
): DashboardPermissions {
  const admin = hasRole(role, "admin");
  const owner = role === "owner";
  return {
    role,
    manageBookings: true,
    bookAnyCalendar: admin,
    manageServices: admin,
    manageResources: admin,
    manageClosures: admin,
    manageTeam: admin,
    manageOwners: owner,
    viewReports: admin,
    manageSettings: admin,
    manageSite: admin && sitesEnabled,
    managePayments: owner,
    manageBilling: owner,
    manageCustomerData: admin,
    viewRevenue: admin,
    manageOffers: admin,
    manageAssistant: admin,
    deleteBusiness: owner,
  };
}

/** Can this member edit a resource's availability? Admins: any. Staff: only resources linked to them. */
export function canEditAvailability(
  role: MemberRole,
  resource: { memberId: string | null },
  myMemberId: string | null,
): boolean {
  if (hasRole(role, "admin")) return true;
  return !!myMemberId && resource.memberId === myMemberId;
}

/** Roles the current member may assign to others. */
export function assignableRoles(role: MemberRole): MemberRole[] {
  if (role === "owner") return ["owner", "admin", "staff"];
  if (role === "admin") return ["admin", "staff"];
  return [];
}

type VFn = (key: VocabularyKey, options?: { title?: boolean; count?: number }) => string;

/** Plain-language role explanations, in the business's own vocabulary. */
export function roleInfo(v: VFn): Record<MemberRole, { label: string; summary: string; can: string[] }> {
  return {
    owner: {
      label: "Owner",
      summary: "Full control, including billing and payouts.",
      can: ["Everything admins can do", "Connect payments and manage the plan", "Add or remove other owners"],
    },
    admin: {
      label: "Admin",
      summary: "Runs the business day to day.",
      can: [
        "Edit services, hours, questions and policies",
        "Invite and manage the team",
        "See reports and every calendar",
      ],
    },
    staff: {
      label: "Staff",
      summary: "Sees and manages their own calendar.",
      can: [
        `See ${v("bookings")} on their own calendar`,
        `Create, move and cancel those ${v("bookings")}`,
        "Set their own working hours and time off",
      ],
    },
  };
}
