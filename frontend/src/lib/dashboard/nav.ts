/**
 * The dashboard's navigation model (architecture §11), without icons: which sections exist, their order, their
 * labels and who may see them. Shared by the website (`components/shells/dashboard-nav.ts` adds the icons) and the
 * mobile app (`mobile/src/shell`), so both show a member the same sections.
 */
import type { Business, MemberRole } from "@/lib/api/types";
import { hasRole } from "@/lib/business/permissions";
import type { VocabularyKey } from "@/lib/vocabulary";

/** Every primary dashboard section, in sidebar order. */
export type DashboardSectionKey =
  | "overview"
  | "calendar"
  | "bookings"
  | "customers"
  | "services"
  | "offers"
  | "resources"
  | "team"
  | "site"
  | "reports"
  | "settings";

export type DashboardSection = {
  key: DashboardSectionKey;
  /** Path under /dashboard/[slug] ("" = overview). */
  segment: string;
  label: string;
  /** When set, the label comes from the business vocabulary (plural, title case). */
  vocabulary?: VocabularyKey;
  /** Minimum role to see the item. */
  minRole: MemberRole;
  /** Only where business websites are on (`Business.sitesEnabled`). */
  requiresSites?: boolean;
};

/** Primary dashboard navigation (architecture §11). Order = sidebar order. */
export const DASHBOARD_SECTIONS: DashboardSection[] = [
  { key: "overview", segment: "", label: "Overview", minRole: "staff" },
  { key: "calendar", segment: "calendar", label: "Calendar", minRole: "staff" },
  { key: "bookings", segment: "bookings", label: "Bookings", vocabulary: "bookings", minRole: "staff" },
  { key: "customers", segment: "customers", label: "Customers", vocabulary: "customers", minRole: "staff" },
  { key: "services", segment: "services", label: "Services", minRole: "staff" },
  { key: "offers", segment: "offers", label: "Offers", minRole: "admin" },
  { key: "resources", segment: "resources", label: "Resources", vocabulary: "resources", minRole: "staff" },
  { key: "team", segment: "team", label: "Team", minRole: "staff" },
  { key: "site", segment: "site", label: "Site", minRole: "admin", requiresSites: true },
  { key: "reports", segment: "reports", label: "Reports", minRole: "admin" },
  { key: "settings", segment: "settings", label: "Settings", minRole: "admin" },
];

/** Whether [role] sees [section], given whether the business has websites on. */
export function sectionVisible(
  section: Pick<DashboardSection, "minRole" | "requiresSites">,
  role: MemberRole,
  sitesEnabled: boolean,
): boolean {
  return hasRole(role, section.minRole) && (sitesEnabled || !section.requiresSites);
}

/** The sections [role] may see, without the site builder unless websites are on. */
export function dashboardSectionsFor(role: MemberRole, sitesEnabled: boolean): DashboardSection[] {
  return DASHBOARD_SECTIONS.filter((section) => sectionVisible(section, role, sitesEnabled));
}

/** `v` from `useVocabulary()`. */
type Words = (key: VocabularyKey, options?: { title?: boolean }) => string;
/** Plain copy, or copy that names the business's own nouns. */
type Copy = string | ((v: Words) => string);

export type SettingsNavItem = {
  segment: string;
  label: Copy;
  minRole: MemberRole;
  description: Copy;
  /** Shown only for businesses (or deployments) this holds for; always when absent. */
  shown?: (business: Pick<Business, "aiAgentsAvailable">) => boolean;
};

/** /dashboard/[slug]/settings/* sections. Read the label and description through `settingsNavText`. */
export const SETTINGS_NAV: SettingsNavItem[] = [
  {
    segment: "general",
    label: "General",
    minRole: "admin",
    description: "Name, address, timezone and contact details.",
  },
  {
    segment: "branding",
    label: "Branding",
    minRole: "admin",
    description: "Colour, logo, cover image and wording.",
  },
  {
    segment: "policies",
    label: (v) => `${v("booking", { title: true })} policies`,
    minRole: "admin",
    description: "Notice, cancellation, refunds and holds.",
  },
  {
    segment: "release-schedules",
    label: "Release schedules",
    minRole: "admin",
    description: (v) => `When each day's times open for ${v("customers")} to book online.`,
  },
  {
    segment: "customer-groups",
    label: (v) => `${v("customer", { title: true })} groups`,
    minRole: "admin",
    description: "Groups with their own availability or services.",
  },
  {
    segment: "questions",
    label: "Questions",
    minRole: "admin",
    description: (v) => `What to ask ${v("customers")} when they book.`,
  },
  {
    segment: "marketplace",
    label: "Marketplace",
    minRole: "admin",
    description: (v) => `Get found by new ${v("customers")} on bookanything.`,
  },
  {
    segment: "ai-agents",
    label: "AI agents",
    minRole: "admin",
    description: "Let your team run the business from Claude, ChatGPT and other AI agents.",
    shown: (b) => b.aiAgentsAvailable === true,
  },
  {
    segment: "payments",
    label: "Payments",
    minRole: "owner",
    description: "Connect Stripe to take payments.",
  },
  {
    segment: "billing",
    label: "Billing",
    minRole: "owner",
    description: "Your bookanything plan and invoices.",
  },
];

/** The settings sections a member with [can] sees for [business]. */
export function visibleSettings(
  business: Pick<Business, "aiAgentsAvailable">,
  can: (role: MemberRole) => boolean,
): SettingsNavItem[] {
  return SETTINGS_NAV.filter((i) => can(i.minRole) && (i.shown?.(business) ?? true));
}

/** A settings section's label and description in the business's words. */
export function settingsNavText(item: SettingsNavItem, v: Words): { label: string; description: string } {
  const text = (copy: Copy) => (typeof copy === "string" ? copy : copy(v));
  return { label: text(item.label), description: text(item.description) };
}

/** The phone tab bar's destinations (the most used pages), in order; "More" opens the full navigation. */
export const TAB_BAR_KEYS: readonly DashboardSectionKey[] = ["overview", "calendar", "bookings", "customers"];

export function dashboardHref(slug: string, segment = "") {
  return segment ? `/dashboard/${slug}/${segment}` : `/dashboard/${slug}`;
}

/** Whether `item` is the current page (or a page under it; the overview only matches itself). */
export function isNavItemActive(item: Pick<DashboardSection, "segment">, slug: string, pathname: string) {
  const href = dashboardHref(slug, item.segment);
  return item.segment === "" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}
