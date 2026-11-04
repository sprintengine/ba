import {
  BadgePercent,
  BarChart3,
  CalendarCheck2,
  CalendarDays,
  Boxes,
  PanelsTopLeft,
  LayoutGrid,
  Settings,
  Sparkles,
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

/** The platform-agnostic model (sections, settings, roles) lives in lib, shared with the mobile app. */
export * from "@/lib/dashboard/nav";

export type DashboardNavItem = DashboardSection & { icon: LucideIcon };

const ICONS: Record<DashboardSectionKey, LucideIcon> = {
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
