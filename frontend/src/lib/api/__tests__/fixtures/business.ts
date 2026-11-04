/**
 * Business, member and team fixtures. Each `x` is complete (every property the spec declares); `xSparse` has every
 * nullable property null and optional ones left out, so the frontend type must accept what the backend may send.
 */
import type { AcceptedInvitation, Business, Me, PublicBusiness, TeamMember } from "@/lib/api/types";
import { ids } from "./ids";
import { publicSite } from "./site";

export const publicBusiness = {
  id: ids.business,
  slug: "lumen-physio",
  name: "Lumen Physiotherapy",
  description: "Physiotherapy for sports injuries.",
  industry: "physio",
  timezone: "Europe/Dublin",
  currency: "EUR",
  locale: "en-IE",
  contactEmail: "hello@lumen-physio.test",
  contactPhone: "+353 1 555 0101",
  websiteUrl: "https://lumen-physio.test",
  address: { line1: "Unit 4, Lantern Quay", line2: "Grand Canal Dock", city: "Dublin", postcode: "D02 X285" },
  branding: {
    primaryColor: "#0e7c70",
    logoUrl: "https://cdn.bookanything.test/logo.png",
    coverImageUrl: "https://cdn.bookanything.test/cover.jpg",
  },
  vocabulary: {
    resource: "therapist",
    resources: "therapists",
    customer: "patient",
    customers: "patients",
    booking: "appointment",
    bookings: "appointments",
  },
  policies: {
    minNoticeMinutes: 60,
    maxAdvanceDays: 60,
    cancellationNoticeHours: 24,
    lateCancellationRefundPercent: 50,
    allowCustomerCancel: true,
    allowCustomerReschedule: true,
    holdMinutes: 30,
    requireCustomerPhone: false,
    nextAvailableOnly: false,
  },
  customerGroups: [{ id: ids.group, name: "Members", description: "Club members get evening slots." }],
  paymentsEnabled: true,
  showBadge: false,
  site: publicSite,
} satisfies PublicBusiness;

export const publicBusinessSparse = {
  ...publicBusiness,
  description: null,
  contactEmail: null,
  contactPhone: null,
  websiteUrl: null,
  address: { line1: null, line2: null, city: null, postcode: null },
  branding: { primaryColor: "#0e7c70", logoUrl: null, coverImageUrl: null },
  customerGroups: [{ id: ids.group, name: "Members", description: null }],
  site: null,
} satisfies PublicBusiness;

/** The dashboard's business (no `site`: only the public endpoint sends it). */
const { site: _site, ...publicFields } = publicBusiness;
const { site: _sparseSite, ...sparsePublicFields } = publicBusinessSparse;

const businessFields = {
  ...publicFields,
  status: "active",
  country: "IE",
  plan: "pro",
  myRole: "owner",
  createdAt: "2026-01-05T09:00:00Z",
} satisfies Business;

export const business = {
  ...businessFields,
  aiAgentsAccess: "team",
  aiAgentsAutoApprove: ["records", "time_off"],
  aiAgentsAvailable: true,
} satisfies Business;

export const businessSparse = { ...businessFields, ...sparsePublicFields } satisfies Business;

const membership = {
  businessId: ids.business,
  slug: "lumen-physio",
  name: "Lumen Physiotherapy",
  role: "owner",
  branding: business.branding,
} satisfies Me["memberships"][number];

export const me = {
  user: { id: ids.user, email: "avery@example.test", name: "Avery Morgan", emailVerified: true },
  memberships: [membership],
  pendingInvitations: [{ token: "inv_7Kq2", businessName: "Gleam Dental", role: "staff" }],
  hasCustomerBookings: true,
} satisfies Me;

export const meSparse = {
  ...me,
  user: { ...me.user, name: null },
  memberships: [{ ...membership, branding: { primaryColor: "#0e7c70", logoUrl: null, coverImageUrl: null } }],
} satisfies Me;

export const acceptedInvitation = { ...me, joinedBusinessId: ids.business } satisfies AcceptedInvitation;

export const acceptedInvitationSparse = {
  ...meSparse,
  joinedBusinessId: ids.business,
} satisfies AcceptedInvitation;

export const teamMember = {
  id: ids.member,
  userId: ids.user,
  name: "Avery Morgan",
  email: "avery@example.test",
  role: "staff",
  status: "active",
  resourceId: ids.resource,
  createdAt: "2026-02-01T09:00:00Z",
} satisfies TeamMember;

/** An invitation nobody has accepted yet. */
export const teamMemberSparse = {
  ...teamMember,
  userId: null,
  name: null,
  status: "invited",
  resourceId: null,
} satisfies TeamMember;
