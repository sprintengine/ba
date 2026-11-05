"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink } from "lucide-react";
import type { MemberRole } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { useVocabulary } from "@/lib/vocabulary";
import { businessNavFor, dashboardHref, isNavItemActive } from "./dashboard-nav";

/**
 * The tabs along the top of every Business page: services, offers, staff and spaces, team, site and settings, and the
 * way out to the public page. Nothing shows on other pages.
 */
export function BusinessStrip({
  slug,
  role,
  sitesEnabled,
}: {
  slug: string;
  role: MemberRole;
  sitesEnabled: boolean;
}) {
  const pathname = usePathname();
  const { v } = useVocabulary();
  const items = businessNavFor(role, sitesEnabled);
  if (!items.some((item) => isNavItemActive(item, slug, pathname))) return null;
  const viewLabel = sitesEnabled ? "View site" : "View booking page";

  return (
    // Runs edge to edge across the page, like the header it is.
    <div
      data-business-strip=""
      className="-mx-4 -mt-6 mb-6 flex items-center gap-4 border-b border-border px-4 sm:-mx-6 sm:-mt-8 sm:mb-8 sm:px-6 lg:-mx-10 lg:px-10"
    >
      <nav
        aria-label="Business"
        className="flex min-w-0 flex-1 snap-x scrollbar-none gap-5 overflow-x-auto max-sm:[mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)] max-sm:pr-8"
      >
        {items.map((item) => {
          const active = isNavItemActive(item, slug, pathname);
          return (
            <Link
              key={item.key}
              href={dashboardHref(slug, item.segment)}
              aria-current={active ? "page" : undefined}
              // On small windows the tabs scroll sideways: keep the current one in view.
              ref={active ? (el) => el?.scrollIntoView({ block: "nearest", inline: "nearest" }) : undefined}
              className={cn(
                "-mb-px inline-flex h-10 shrink-0 snap-start items-center justify-center border-b-2 text-sm font-medium whitespace-nowrap transition-colors pointer-coarse:h-11 pointer-coarse:min-w-11",
                active
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {item.vocabulary ? v(item.vocabulary, { title: true }) : item.label}
            </Link>
          );
        })}
      </nav>
      <a
        href={`/${slug}`}
        target="_blank"
        rel="noopener"
        className="mb-px inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground max-sm:hidden pointer-coarse:h-11"
      >
        <ExternalLink className="size-4" />
        {viewLabel}
      </a>
    </div>
  );
}
