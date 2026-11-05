import {
  BadgePercent,
  BarChart3,
  Building2,
  CalendarCheck2,
  CalendarDays,
  PanelsTopLeft,
  LayoutGrid,
  Settings,
  Tag,
  UserCog,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import type { MemberRole } from "@/lib/api/types";
import {
  DASHBOARD_SECTIONS,
  sectionVisible,
  type DashboardSection,
  type DashboardSectionKey,
} from "@/lib/dashboard/nav";

/** A rail item: glyph over its label. */
export const railClass =
  "relative flex w-16 flex-col items-center gap-1 rounded-lg px-0.5 pt-2 pb-1.5 text-xs leading-4 font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&_svg]:size-4.5 [&_svg]:shrink-0";
export const railIdle = "text-muted-foreground hover:bg-accent hover:text-foreground";

/** The platform-agnostic model (sections, settings, roles) lives in lib, shared with the mobile app. */
export * from "@/lib/dashboard/nav";

export type DashboardNavItem = DashboardSection & { icon: LucideIcon };

const ICONS: Record<DashboardSectionKey, LucideIcon> = {
  overview: LayoutGrid,
  calendar: CalendarDays,
  bookings: CalendarCheck2,
  customers: Users,
  services: Tag,
  offers: BadgePercent,
  resources: UserCog,
  team: UsersRound,
  site: PanelsTopLeft,
  reports: BarChart3,
  settings: Settings,
};

/** Primary dashboard navigation with the website's icons. Order = sidebar order. */
export const DASHBOARD_NAV: DashboardNavItem[] = DASHBOARD_SECTIONS.map((section) => ({
  ...section,
  icon: ICONS[section.key],
}));

/** The items [role] may see, without the site builder unless websites are on. */
export function dashboardNavFor(role: MemberRole, sitesEnabled: boolean): DashboardNavItem[] {
  return DASHBOARD_NAV.filter((item) => sectionVisible(item, role, sitesEnabled));
}

/** The sections gathered under Business in the rail, in order; the strip on those pages moves between them. */
const BUSINESS_KEYS: readonly DashboardSectionKey[] = [
  "services",
  "offers",
  "resources",
  "team",
  "site",
  "settings",
];

/** The Business sections [role] may see. */
export function businessNavFor(role: MemberRole, sitesEnabled: boolean): DashboardNavItem[] {
  return dashboardNavFor(role, sitesEnabled).filter((item) => BUSINESS_KEYS.includes(item.key));
}

export type RailItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  /** The section the link opens. */
  section: DashboardNavItem;
  /** The sections that light this item. */
  covers: DashboardNavItem[];
  /** Take the label from the business vocabulary. */
  vocabulary?: DashboardNavItem["vocabulary"];
};

/**
 * The rail's five items. Today, Calendar (with the Bookings list behind it), Customers, Business (everything about how
 * the business is set up) and Reports. Every section stays reachable; ones [role] may not see drop out.
 */
export function railItemsFor(role: MemberRole, sitesEnabled: boolean): RailItem[] {
  const visible = dashboardNavFor(role, sitesEnabled);
  const section = (key: DashboardSectionKey) => visible.find((item) => item.key === key);
  const business = businessNavFor(role, sitesEnabled);
  const single = (key: DashboardSectionKey, label: string, icon?: LucideIcon): RailItem[] => {
    const item = section(key);
    return item
      ? [{ key, label, icon: icon ?? item.icon, section: item, covers: [item], vocabulary: item.vocabulary }]
      : [];
  };
  const calendar = section("calendar");
  const bookings = section("bookings");
  return [
    ...single("overview", "Today"),
    ...(calendar
      ? [
          {
            key: "calendar",
            label: "Calendar",
            icon: calendar.icon,
            section: calendar,
            covers: bookings ? [calendar, bookings] : [calendar],
          },
        ]
      : []),
    ...single("customers", "Customers"),
    ...(business[0]
      ? [{ key: "business", label: "Business", icon: Building2, section: business[0], covers: business }]
      : []),
    ...single("reports", "Reports"),
  ];
}
