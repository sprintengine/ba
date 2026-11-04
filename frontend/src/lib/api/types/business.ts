/** API types: Business. Import them from `@/lib/api/types`. */
import type { BusinessStatus, MemberRole, Plan } from "./common";
import type { PublicSite, SiteThemeKey } from "./site";

/** Industry-specific nouns ("Therapist"/"Therapists", "Patient"/"Patients", …). */
export type Vocabulary = {
  resource: string;
  resources: string;
  customer: string;
  customers: string;
  booking: string;
  bookings: string;
};

export type Branding = {
  /** `#rrggbb` */
  primaryColor: string;
  logoUrl: string | null;
  coverImageUrl: string | null;
  /**
   * The booking portal's style preset (fonts, corners, surfaces). Always set on responses (the industry's default until
   * chosen); optional so older payloads and partial updates still type-check.
   */
  portalStyle?: SiteThemeKey | null;
};

export type Policies = {
  minNoticeMinutes: number;
  maxAdvanceDays: number;
  cancellationNoticeHours: number;
  /** 0..100 — share of the amount paid refunded on a late customer cancellation. */
  lateCancellationRefundPercent: number;
  allowCustomerCancel: boolean;
  allowCustomerReschedule: boolean;
  /** How long an unpaid booking holds its slot. */
  holdMinutes: number;
  requireCustomerPhone: boolean;
  /** Customers are offered one time at a time (the earliest free one) instead of every free time. */
  nextAvailableOnly: boolean;
};

export type Address = {
  line1: string | null;
  line2: string | null;
  city: string | null;
  postcode: string | null;
};

export type PublicBusiness = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  industry: string;
  /** IANA zone, e.g. `"Europe/Dublin"`. */
  timezone: string;
  /** ISO 4217, e.g. `"EUR"`. */
  currency: string;
  /** BCP 47, e.g. `"en-IE"`. */
  locale: string;
  contactEmail: string | null;
  contactPhone: string | null;
  websiteUrl: string | null;
  address: Address;
  branding: Branding;
  vocabulary: Vocabulary;
  policies: Policies;
  customerGroups: { id: string; name: string; description: string | null }[];
  paymentsEnabled: boolean;
  /** Show the "Powered by bookanything" badge (free plan). */
  showBadge: boolean;
  /**
   * The public site (§15): the published plan, or a default derived from the business.
   * Only `GET /v1/public/businesses/{slug}` includes it; other embeddings send null.
   */
  site?: PublicSite | null;
};

export type Business = PublicBusiness & {
  status: BusinessStatus;
  /** ISO 3166-1 alpha-2. */
  country: string;
  plan: Plan;
  /** The caller's role in this business. */
  myRole: MemberRole;
  createdAt: string;
  /** This deployment offers business websites (`SITES_ENABLED`, off by default); without them there's no site builder. */
  sitesEnabled?: boolean;
  /** Who may run the business from their own AI apps (the owner changes it in Settings › AI agents). */
  aiAgentsAccess?: AiAgentsAccess;
  /** Kinds of single change members' AI apps make without approval here (none by default). */
  aiAgentsAutoApprove?: AgentChangeKind[];
  /** This deployment serves the business MCP (`BUSINESS_MCP_ENABLED`); the AI agents settings are hidden when it doesn't. */
  aiAgentsAvailable?: boolean;
};

export type UpdateBusiness = Partial<{
  name: string;
  slug: string;
  description: string | null;
  timezone: string;
  currency: string;
  locale: string;
  contactEmail: string | null;
  contactPhone: string | null;
  websiteUrl: string | null;
  address: Address;
  branding: Branding;
  vocabulary: Vocabulary;
  policies: Policies;
  status: "draft" | "active";
  /** Owners only. */
  aiAgentsAccess: AiAgentsAccess;
  /** Owners only. */
  aiAgentsAutoApprove: AgentChangeKind[];
}>;

/** Who may run a business from their own AI apps: nobody, owners and admins (the default), or the whole team. */
export type AiAgentsAccess = "off" | "admins" | "team";

/**
 * A kind of change a member's AI app can propose (§20.8): booking notes and customer records; new bookings, moves,
 * approvals, outcomes and payments; cancellations and declines; time off and closures; opening hours, services and deals.
 */
export type AgentChangeKind = "records" | "bookings" | "cancellations" | "time_off" | "settings";
