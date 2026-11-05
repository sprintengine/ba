"use client";

import Link from "next/link";
import { Mail, MapPin, Phone } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { groupedHours } from "@/lib/site/plan";
import { touchHitArea } from "@/components/ui/touch";
import { cn } from "@/lib/utils";
import { BookButton, SiteContainer } from "./primitives";
import { useSiteRender } from "./site-render-context";

export function SiteFooter() {
  const { business, context } = useSiteRender();
  const address = [
    business.address.line1,
    business.address.line2,
    business.address.city,
    business.address.postcode,
  ]
    .filter(Boolean)
    .join(", ");
  const hours = groupedHours(context.openingHours).filter((g) => g.hours);
  return (
    <footer className="border-t border-border bg-surface-sunken">
      <SiteContainer className="grid gap-10 py-14 @3xl:grid-cols-[1.4fr_1fr_1fr]">
        <div className="flex flex-col gap-4">
          <p className="site-heading text-2xl">{business.name}</p>
          {business.description && (
            <p className="max-w-sm text-sm text-pretty text-muted-foreground">{business.description}</p>
          )}
          <BookButton size="md" className="w-fit" arrow>
            Book online
          </BookButton>
        </div>
        <ul className="flex flex-col gap-2.5 text-sm text-muted-foreground pointer-coarse:gap-0">
          {address && (
            <li className="flex items-start gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden /> {address}
            </li>
          )}
          {business.contactPhone && (
            <li className="flex items-center gap-2">
              <Phone className="size-4 shrink-0" aria-hidden />
              <a
                href={`tel:${business.contactPhone.replace(/\s+/g, "")}`}
                className="inline-flex items-center hover:text-foreground pointer-coarse:min-h-11"
              >
                {business.contactPhone}
              </a>
            </li>
          )}
          {business.contactEmail && (
            <li className="flex items-center gap-2">
              <Mail className="size-4 shrink-0" aria-hidden />
              <a
                href={`mailto:${business.contactEmail}`}
                className="inline-flex items-center break-all hover:text-foreground pointer-coarse:min-h-11"
              >
                {business.contactEmail}
              </a>
            </li>
          )}
        </ul>
        {hours.length > 0 && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 self-start text-sm">
            {hours.map((g) => (
              <div key={g.label} className="contents">
                <dt className="text-muted-foreground">{g.label}</dt>
                <dd className="tnum">{g.hours}</dd>
              </div>
            ))}
          </dl>
        )}
      </SiteContainer>
      <SiteContainer className="flex flex-col gap-3 border-t border-border py-6 text-xs text-subtle-foreground @2xl:flex-row @2xl:items-center @2xl:justify-between">
        <p>
          © {new Date().getFullYear()} {business.name}
        </p>
        {business.showBadge ? (
          <a
            href="https://bookanything.ie"
            target="_blank"
            rel="noopener"
            className={cn(
              "inline-flex w-fit items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 font-medium text-muted-foreground shadow-xs transition-colors hover:text-foreground",
              touchHitArea,
            )}
          >
            <LogoMark className="size-4" mono weight="small" aria-hidden title="" />
            Powered by bookanything
          </a>
        ) : (
          <Link
            href="/my/bookings"
            className="inline-flex items-center hover:text-foreground pointer-coarse:min-h-11"
          >
            Manage my bookings
          </Link>
        )}
      </SiteContainer>
    </footer>
  );
}

/** A thumb-reachable Book bar on narrow screens (sticks to the bottom of the site). */
export function MobileBookBar() {
  const { business } = useSiteRender();
  return (
    <div className="sticky bottom-0 z-20 border-t border-border bg-surface/90 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl @3xl:hidden">
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{business.name}</p>
        <BookButton size="lg">Book now</BookButton>
      </div>
    </div>
  );
}
