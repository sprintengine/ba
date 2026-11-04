"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink, PanelLeftClose, PanelLeftOpen, Search, X } from "lucide-react";
import type { Membership, MemberRole } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { useVocabulary } from "@/lib/vocabulary";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip } from "@/components/ui/tooltip";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { BusinessSwitcher, type DashboardShellBusiness } from "./business-switcher";
import { dashboardHref, dashboardNavFor, isNavItemActive } from "./dashboard-nav";
import { UserMenu } from "./user-menu";

/** A sidebar row: 32px with a mouse, 44px on touch; a centred square in the rail. */
const rowClass = (collapsed: boolean) =>
  cn(
    "flex h-8 items-center gap-2.5 rounded-md px-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none pointer-coarse:h-11",
    collapsed && "justify-center px-0",
  );

/**
 * Sidebar body (the aside, and the navigation sheet on phones and iPad portrait): business switcher, search, nav,
 * view site, collapse, user menu. `collapsed` is the glyph rail: every glyph is named and has a tooltip, and the
 * current page is marked by a filled tile and a bar on the edge.
 */
export function SidebarContent({
  business,
  role,
  memberships,
  collapsed,
  onToggleCollapsed,
  onClose,
  onOpenCommand,
}: {
  business: DashboardShellBusiness | null;
  role: MemberRole;
  memberships: Membership[];
  collapsed: boolean;
  onToggleCollapsed?: () => void;
  /** In the navigation sheet: a close button at the top. */
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
          <BusinessSwitcher business={business} memberships={memberships} collapsed={collapsed} />
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
        {collapsed ? (
          <Tooltip content="Search" shortcut="⌘K" side="right">
            <button
              type="button"
              onClick={onOpenCommand}
              aria-label="Search"
              className={cn(
                rowClass(true),
                "w-full text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Search className="size-4 pointer-coarse:size-5" />
            </button>
          </Tooltip>
        ) : (
          <button
            type="button"
            onClick={onOpenCommand}
            className="flex h-8 w-full items-center gap-2 rounded-lg border border-border bg-surface px-2.5 text-sm text-subtle-foreground shadow-xs transition-colors hover:border-border-strong hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:bg-surface pointer-coarse:h-11"
          >
            <Search className="size-3.5" />
            <span className="flex-1 text-left">Search…</span>
            <span className="flex gap-0.5 pointer-coarse:hidden">
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </span>
          </button>
        )}
      </div>

      {/* Nav */}
      <nav aria-label="Dashboard" className="flex flex-col gap-px pointer-coarse:gap-0.5">
        {items.map((item) => {
          const href = business ? dashboardHref(business.slug, item.segment) : "#";
          const active = business ? isNavItemActive(item, business.slug, pathname) : false;
          const label = item.vocabulary ? v(item.vocabulary, { title: true }) : item.label;
          const link = (
            <Link
              key={item.key}
              href={href}
              aria-current={active ? "page" : undefined}
              // Collapsed, the icon is all there is (the tooltip only describes): name the link.
              aria-label={collapsed ? label : undefined}
              className={cn(
                rowClass(collapsed),
                "group relative font-medium",
                active
                  ? "bg-surface text-foreground shadow-xs ring-1 ring-border dark:bg-accent dark:ring-transparent"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
                // In the rail the tile alone can be subtle: a bar on the edge marks the current page too.
                collapsed &&
                  active &&
                  "before:absolute before:top-1/2 before:-left-2.5 before:h-5 before:w-[3px] before:-translate-y-1/2 before:rounded-r-full before:bg-brand",
              )}
            >
              <item.icon
                className={cn(
                  "size-4 shrink-0 transition-colors",
                  collapsed && "pointer-coarse:size-5",
                  active ? "text-brand" : "text-subtle-foreground group-hover:text-muted-foreground",
                )}
              />
              {!collapsed && <span className="min-w-0 break-words">{label}</span>}
            </Link>
          );
          return collapsed ? (
            <Tooltip key={item.key} content={label} side="right">
              {link}
            </Tooltip>
          ) : (
            link
          );
        })}
      </nav>

      <div className="flex-1" />

      {/* Footer */}
      <div className="flex flex-col gap-1">
        {business && (
          <Tooltip content={viewLabel} side="right" disabled={!collapsed}>
            <a
              href={`/${business.slug}`}
              target="_blank"
              rel="noopener"
              aria-label={collapsed ? viewLabel : undefined}
              className={cn(
                rowClass(collapsed),
                "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <ExternalLink className="size-4 shrink-0 text-subtle-foreground" />
              {!collapsed && <span>{viewLabel}</span>}
            </a>
          </Tooltip>
        )}
        <NotificationBell
          variant="row"
          collapsed={collapsed}
          side="right"
          align="end"
          className={cn(rowClass(collapsed), "text-muted-foreground hover:bg-accent hover:text-foreground")}
        />
        {onToggleCollapsed && (
          <Tooltip content={collapsed ? "Expand sidebar" : "Collapse sidebar"} shortcut="⌘\" side="right">
            <button
              type="button"
              onClick={onToggleCollapsed}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className={cn(
                rowClass(collapsed),
                "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {collapsed ? (
                <PanelLeftOpen className="size-4 pointer-coarse:size-5" />
              ) : (
                <PanelLeftClose className="size-4 text-subtle-foreground" />
              )}
              {!collapsed && <span>Collapse</span>}
            </button>
          </Tooltip>
        )}
        <div className="mt-1 border-t border-border pt-2">
          <UserMenu variant="row" collapsed={collapsed} align="start" side="top" />
        </div>
      </div>
    </div>
  );
}
