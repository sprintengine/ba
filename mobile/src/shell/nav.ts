/**
 * The app's navigation model: which destinations each experience has, in which order, with which icon, and who sees
 * them. The business sections and their role rules are the website's (`@shared/dashboard/nav`), so a member sees the
 * same sections on both; the app adds Approvals (a page the website reaches from notifications) and, on phones, More.
 *
 * `routeName` is the tab's route in the layout that hosts it (app/(customer)/_layout.tsx,
 * app/dashboard/[slug]/_layout.tsx). Adding a destination: add its route folder, then an entry here.
 */
import type { Href } from "expo-router";
import {
  BadgePercent,
  BarChart3,
  Boxes,
  CalendarCheck2,
  CalendarDays,
  CircleCheckBig,
  Compass,
  Ellipsis,
  LayoutGrid,
  PanelsTopLeft,
  Settings,
  Sparkles,
  UserRound,
  Users,
  UsersRound,
} from "lucide-react-native";
import type { MemberRole, Vocabulary } from "@shared/api/types";
import { dashboardSectionsFor, TAB_BAR_KEYS, type DashboardSectionKey } from "@shared/dashboard/nav";
import { vocab } from "@shared/vocabulary";
import type { IconComponent } from "~/ui";

export type NavItem = {
  key: string;
  label: string;
  icon: IconComponent;
  /** Tab route name in the hosting layout. */
  routeName: string;
  href: Href;
  /** In the phone tab bar (the rest are under More on phones, all in the sidebar on large screens). */
  phoneTab: boolean;
  /** Only in the phone tab bar (More duplicates the sidebar). */
  phoneOnly?: boolean;
};

/** The customer experience: phone tabs and the large-screen sidebar. */
export const CUSTOMER_NAV: NavItem[] = [
  {
    key: "explore",
    label: "Explore",
    icon: Compass,
    routeName: "(explore)",
    href: "/explore",
    phoneTab: true,
  },
  {
    key: "bookings",
    label: "My bookings",
    icon: CalendarCheck2,
    routeName: "(bookings)",
    href: "/my/bookings",
    phoneTab: true,
  },
  {
    key: "approvals",
    label: "Approvals",
    icon: CircleCheckBig,
    routeName: "(approvals)",
    href: "/my/approvals",
    phoneTab: true,
  },
  { key: "account", label: "Account", icon: UserRound, routeName: "(account)", href: "/my", phoneTab: true },
];

type BusinessKey = DashboardSectionKey | "approvals" | "more";

const SECTION_ICONS: Record<BusinessKey, IconComponent> = {
  overview: LayoutGrid,
  calendar: CalendarDays,
  bookings: CalendarCheck2,
  customers: Users,
  services: Sparkles,
  offers: BadgePercent,
  resources: Boxes,
  team: UsersRound,
  site: PanelsTopLeft,
  reports: BarChart3,
  settings: Settings,
  approvals: CircleCheckBig,
  more: Ellipsis,
};

/** Each section's tab route in app/dashboard/[slug]/_layout.tsx (the overview is a group: its URL is the slug). */
export const BUSINESS_ROUTES: Record<BusinessKey, string> = {
  overview: "(overview)",
  calendar: "calendar",
  bookings: "bookings",
  customers: "customers",
  services: "services",
  offers: "offers",
  resources: "resources",
  team: "team",
  site: "site",
  reports: "reports",
  settings: "settings",
  approvals: "approvals",
  more: "more",
};

export type BusinessNavInput = {
  slug: string;
  role: MemberRole;
  sitesEnabled: boolean;
  vocabulary?: Partial<Vocabulary> | null;
};

/** The business experience for a member: the website's sections for their role, then Approvals, then More. */
export function businessNav({ slug, role, sitesEnabled, vocabulary }: BusinessNavInput): NavItem[] {
  const base = `/dashboard/${slug}`;
  const items: NavItem[] = dashboardSectionsFor(role, sitesEnabled).map((section) => ({
    key: section.key,
    label:
      section.key === "overview"
        ? "Today"
        : section.vocabulary
          ? vocab(vocabulary, section.vocabulary, { title: true })
          : section.label,
    icon: SECTION_ICONS[section.key],
    routeName: BUSINESS_ROUTES[section.key],
    href: (section.segment ? `${base}/${section.segment}` : base) as Href,
    phoneTab: TAB_BAR_KEYS.includes(section.key),
  }));
  // Every member approves their own AI agents' requests (architecture §20.8): before Settings, or last.
  const settingsAt = items.findIndex((i) => i.key === "settings");
  items.splice(settingsAt < 0 ? items.length : settingsAt, 0, {
    key: "approvals",
    label: "Approvals",
    icon: SECTION_ICONS.approvals,
    routeName: BUSINESS_ROUTES.approvals,
    href: `${base}/approvals` as Href,
    phoneTab: false,
  });
  items.push({
    key: "more",
    label: "More",
    icon: SECTION_ICONS.more,
    routeName: BUSINESS_ROUTES.more,
    href: `${base}/more` as Href,
    phoneTab: true,
    phoneOnly: true,
  });
  return items;
}

/** What the phone tab bar shows. */
export function phoneTabs(items: NavItem[]): NavItem[] {
  return items.filter((item) => item.phoneTab);
}

/** What the large-screen sidebar shows. */
export function sidebarItems(items: NavItem[]): NavItem[] {
  return items.filter((item) => !item.phoneOnly);
}

/** What More lists on phones: everything not in the tab bar. */
export function moreItems(items: NavItem[]): NavItem[] {
  return items.filter((item) => !item.phoneTab);
}
