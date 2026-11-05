"use client";

import Link from "next/link";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import type { Membership } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/brand/logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { BusinessTile } from "./business-tile";
import { dashboardHref } from "./dashboard-nav";

/** What the dashboard chrome needs to know about the current business. */
export type DashboardShellBusiness = {
  slug: string;
  name: string;
  branding: { primaryColor: string; logoUrl: string | null };
  /** Business websites are on for this deployment: the Site item and "View site" appear. */
  sitesEnabled?: boolean;
};

/** The current business and a menu to switch to another one (or create one). Skeleton while loading. */
export function BusinessSwitcher({
  business,
  memberships,
  collapsed,
}: {
  business: DashboardShellBusiness | null;
  memberships: Membership[];
  collapsed: boolean;
}) {
  if (!business) {
    return (
      <div className="flex h-11 items-center gap-2.5 px-1.5">
        <Skeleton className="size-7 rounded-md" />
        {!collapsed && <Skeleton className="h-4 w-28" />}
      </div>
    );
  }
  const current = memberships.find((m) => m.slug === business.slug);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex min-h-11 w-full items-center gap-2.5 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-[state=open]:bg-accent",
            collapsed && "justify-center px-0",
          )}
        >
          {/* Collapsed, the tile is all that shows: its initials are hidden and the name is screen-reader text, which an
              aria-label could not be (it would have to contain the initials, WCAG 2.5.3). */}
          <span aria-hidden={collapsed || undefined} className="contents">
            <BusinessTile
              name={business.name}
              logoUrl={business.branding.logoUrl}
              color={business.branding.primaryColor}
            />
          </span>
          {collapsed && <span className="sr-only">{`${business.name}, switch business`}</span>}
          {!collapsed && (
            <>
              <span className="flex min-w-0 flex-1 flex-col">
                <span
                  className="line-clamp-2 text-sm leading-5 font-semibold break-words"
                  title={business.name}
                >
                  {business.name}
                </span>
                <span className="truncate text-xs text-subtle-foreground capitalize">
                  {current?.role ?? "member"}
                </span>
              </span>
              <ChevronsUpDown className="size-3.5 shrink-0 text-subtle-foreground" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64" align="start">
        <DropdownMenuLabel>Businesses</DropdownMenuLabel>
        {memberships.map((m) => (
          <DropdownMenuItem key={m.businessId} asChild>
            <Link href={dashboardHref(m.slug)}>
              <BusinessTile
                name={m.name}
                logoUrl={m.branding.logoUrl}
                color={m.branding.primaryColor}
                size="sm"
              />
              <span className="flex-1 truncate">{m.name}</span>
              {m.slug === business.slug && <Check className="text-foreground!" />}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/onboarding">
            <Plus /> Create a business
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/">
            <LogoMark className="h-3.5! w-auto!" mono aria-hidden title="" /> bookanything website
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
