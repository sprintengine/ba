"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import type { MemberRole } from "@/lib/api/types";
import { hasRole } from "@/lib/business/permissions";
import { cn } from "@/lib/utils";
import { useVocabulary } from "@/lib/vocabulary";
import { DASHBOARD_NAV, TAB_BAR_KEYS, dashboardHref, isNavItemActive } from "./dashboard-nav";
import { useSoftKeyboardOpen } from "./use-shell-layout";

const tabClass =
  "flex min-w-0 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-lg px-0.5 pt-1.5 pb-1 text-center text-xs leading-4 font-medium tracking-tight whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset [&_svg]:size-5.5 [&_svg]:shrink-0";

/**
 * Phone navigation (below `sm`; every iPad, the mini included, gets the rail): the most used pages as glyphs with short labels, and "More" for the full
 * navigation sheet. Sits above the home indicator and steps aside while the on-screen keyboard is up.
 */
export function DashboardTabBar({
  slug,
  role,
  moreOpen,
  onOpenMore,
}: {
  slug: string | null;
  role: MemberRole;
  moreOpen: boolean;
  onOpenMore: () => void;
}) {
  const pathname = usePathname();
  const { v } = useVocabulary();
  const keyboardOpen = useSoftKeyboardOpen();
  const items = DASHBOARD_NAV.filter(
    (item) => TAB_BAR_KEYS.includes(item.key) && hasRole(role, item.minRole),
  );
  const onTab = slug !== null && items.some((item) => isNavItemActive(item, slug, pathname));

  return (
    <nav
      aria-label="Quick navigation"
      data-dashboard-tab-bar=""
      hidden={keyboardOpen}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl sm:hidden"
    >
      <ul className="grid h-(--tab-bar-height) grid-cols-5">
        {items.map((item) => {
          const active = slug !== null && isNavItemActive(item, slug, pathname);
          const label =
            item.key === "overview"
              ? "Today"
              : item.vocabulary
                ? v(item.vocabulary, { title: true })
                : item.label;
          return (
            <li key={item.key} className="flex min-w-0">
              <Link
                href={slug ? dashboardHref(slug, item.segment) : "#"}
                aria-current={active ? "page" : undefined}
                className={cn(tabClass, "flex-1", active ? "text-foreground" : "text-muted-foreground")}
              >
                <item.icon
                  aria-hidden
                  className={cn(active && "text-foreground")}
                  strokeWidth={active ? 2.25 : 1.75}
                />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
        <li className="flex min-w-0">
          <button
            type="button"
            onClick={onOpenMore}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            className={cn(
              tabClass,
              "flex-1",
              moreOpen || (!onTab && slug !== null) ? "text-foreground" : "text-muted-foreground",
            )}
          >
            <Menu aria-hidden className={cn(!onTab && slug !== null && "text-foreground")} />
            <span>More</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
