"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink, Search, X } from "lucide-react";
import type { Membership, MemberRole } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { useVocabulary } from "@/lib/vocabulary";
import { Kbd } from "@/components/ui/kbd";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { BusinessSwitcher, type DashboardShellBusiness } from "./business-switcher";
import { dashboardHref, dashboardNavFor, isNavItemActive, railItemsFor } from "./dashboard-nav";
import { UserMenu } from "./user-menu";

/** A row in the navigation sheet: 32px with a mouse, 44px on touch. */
const rowClass =
  "flex h-8 items-center gap-2.5 rounded-md px-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none pointer-coarse:h-11";

/** A rail item: glyph over its label. */
const railClass =
  "relative flex w-16 flex-col items-center gap-1 rounded-lg px-0.5 pt-2 pb-1.5 text-xs leading-4 font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&_svg]:size-4.5 [&_svg]:shrink-0";
const railIdle = "text-muted-foreground hover:bg-accent hover:text-foreground";

/**
 * The 80px rail, from iPad portrait up: the business, the five sections, then search, notifications and the account.
 * Every item keeps its label, at every width.
 */
export function DashboardRail({
  business,
  role,
  memberships,
  onOpenCommand,
}: {
  business: DashboardShellBusiness | null;
  role: MemberRole;
  memberships: Membership[];
  onOpenCommand: () => void;
}) {
  const pathname = usePathname();
  const { v } = useVocabulary();
  const items = railItemsFor(role, !!business?.sitesEnabled);

  return (
    <div className="flex h-full scrollbar-none flex-col items-center gap-1 overflow-y-auto px-2 py-3">
      <div className="mb-2 w-16">
        <BusinessSwitcher business={business} memberships={memberships} collapsed />
      </div>

      <nav aria-label="Dashboard" className="flex flex-col gap-1">
        {items.map((item) => {
          const href = business ? dashboardHref(business.slug, item.section.segment) : "#";
          const active = business
            ? item.covers.some((section) => isNavItemActive(section, business.slug, pathname))
            : false;
          const label = item.vocabulary ? v(item.vocabulary, { title: true }) : item.label;
          return (
            <Link
              key={item.key}
              href={href}
              aria-current={active ? "page" : undefined}
              title={label}
              className={cn(railClass, active ? "bg-background font-semibold text-foreground" : railIdle)}
            >
              <item.icon strokeWidth={active ? 2.25 : 1.75} />
              <span className="max-w-full truncate">{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="flex-1" />

      <div className="flex flex-col items-center gap-1">
        <button type="button" onClick={onOpenCommand} className={cn(railClass, railIdle)}>
          <Search strokeWidth={1.75} />
          <span>Search</span>
        </button>
        <NotificationBell variant="rail" side="right" align="end" className={cn(railClass, railIdle)} />
        <UserMenu variant="row" collapsed align="start" side="right" />
      </div>
    </div>
  );
}

/**
 * The full navigation, for the sheet behind "More" on phones: business switcher, search, every section, the public
 * page and the account.
 */
export function SidebarContent({
  business,
  role,
  memberships,
  onClose,
  onOpenCommand,
}: {
  business: DashboardShellBusiness | null;
  role: MemberRole;
  memberships: Membership[];
  /** A close button at the top. */
  onClose?: () => void;
  onOpenCommand: () => void;
}) {
  const pathname = usePathname();
  const { v } = useVocabulary();
  const sitesEnabled = !!business?.sitesEnabled;
  const items = dashboardNavFor(role, sitesEnabled);
  const viewLabel = sitesEnabled ? "View site" : "View booking page";

  return (
    <div className="flex h-full scrollbar-none flex-col gap-1 overflow-y-auto px-2.5 py-3">
      {/* Business switcher */}
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <BusinessSwitcher business={business} memberships={memberships} collapsed={false} />
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none pointer-coarse:size-11"
          >
            <X className="size-4.5" />
          </button>
        )}
      </div>

      {/* Search */}
      <div className="mt-2 mb-1">
        <button
          type="button"
          onClick={onOpenCommand}
          className="flex h-8 w-full items-center gap-2 rounded-lg border border-border bg-surface px-2.5 text-sm text-subtle-foreground shadow-xs transition-colors hover:border-border-strong hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:bg-surface pointer-coarse:h-11"
        >
          <Search className="size-3.5" />
          <span className="flex-1 text-left">Search…</span>
          <span className="flex gap-0.5 max-sm:hidden pointer-coarse:hidden">
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </span>
        </button>
      </div>

      {/* Nav */}
      <nav aria-label="Dashboard" className="flex flex-col gap-px pointer-coarse:gap-0.5">
        {items.map((item) => {
          const href = business ? dashboardHref(business.slug, item.segment) : "#";
          const active = business ? isNavItemActive(item, business.slug, pathname) : false;
          const label = item.vocabulary ? v(item.vocabulary, { title: true }) : item.label;
          return (
            <Link
              key={item.key}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                rowClass,
                "group relative font-medium",
                active
                  ? "bg-surface text-foreground shadow-xs ring-1 ring-border dark:bg-accent dark:ring-transparent"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <item.icon
                className={cn(
                  "size-4 shrink-0 transition-colors",
                  active ? "text-foreground" : "text-subtle-foreground group-hover:text-muted-foreground",
                )}
              />
              <span className="min-w-0 break-words">{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="flex-1" />

      {/* Footer */}
      <div className="flex flex-col gap-1">
        {business && (
          <a
            href={`/${business.slug}`}
            target="_blank"
            rel="noopener"
            className={cn(rowClass, "text-muted-foreground hover:bg-accent hover:text-foreground")}
          >
            <ExternalLink className="size-4 shrink-0 text-subtle-foreground" />
            <span>{viewLabel}</span>
          </a>
        )}
        <NotificationBell
          variant="row"
          side="right"
          align="end"
          className={cn(rowClass, "text-muted-foreground hover:bg-accent hover:text-foreground")}
        />
        <div className="mt-1 border-t border-border pt-2">
          <UserMenu variant="row" align="start" side="top" />
        </div>
      </div>
    </div>
  );
}
