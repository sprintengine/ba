"use client";

import Link from "next/link";
import { ArrowRight, Tag } from "lucide-react";
import { usePublicOffers } from "@/lib/api/hooks";
import type { PublicOffer } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { touchHitArea } from "@/components/ui/touch";
import { cn } from "@/lib/utils";
import { CARD, CARD_HOVER } from "@/components/site/theme-classes";
import { SiteContainer } from "@/components/site/primitives";
import { useSiteRender } from "@/components/site/site-render-context";
import { DealBadge } from "./deal-price";

/**
 * Loads the business's active deals (from `initialOffers` when the server rendered them) and shows them; renders
 * nothing while loading, on error or with none.
 */
export function SiteDeals({
  slug,
  initialOffers = null,
}: {
  slug: string;
  initialOffers?: PublicOffer[] | null;
}) {
  const offers = usePublicOffers(slug, { initialData: initialOffers ?? undefined });
  // Defensive: an older API without deals answers with something else (or 404).
  return <DealsStrip offers={Array.isArray(offers.data) ? offers.data : []} />;
}

/**
 * Active deals on the business's site (rendered by the public site page inside `SiteRenderer`, so
 * it follows the site theme). Not a site-plan section: it appears on its own whenever deals exist.
 */
export function DealsStrip({ offers }: { offers: PublicOffer[] }) {
  const { business, theme, bookHref, services } = useSiteRender();
  if (offers.length === 0) return null;
  const serviceName = (id: string) => services.find((s) => s.id === id)?.name;
  return (
    <section
      aria-labelledby="deals-heading"
      id="deals"
      className="scroll-mt-20 border-y border-border-subtle bg-surface-sunken py-8 @3xl:py-10"
    >
      <SiteContainer className="flex flex-col gap-5">
        <h2 id="deals-heading" className="site-heading flex items-center gap-2 text-xl @3xl:text-2xl">
          <Tag className="size-5 text-highlight" aria-hidden />
          {offers.length === 1 ? "Current deal" : "Current deals"}
        </h2>
        <ul
          className={cn(
            "grid gap-3",
            offers.length > 1 && "@2xl:grid-cols-2",
            offers.length > 2 && "@5xl:grid-cols-3",
          )}
        >
          {offers.map((o) => {
            const single = o.serviceIds.length === 1 ? o.serviceIds[0] : undefined;
            const only = single ? serviceName(single) : undefined;
            return (
              <li
                key={o.id}
                className={cn("flex flex-col gap-3 p-5", CARD[theme.card], CARD_HOVER[theme.card])}
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold text-balance">{o.name}</h3>
                  <DealBadge label={o.label} className="shrink-0" />
                </div>
                {o.description && (
                  <p className="text-sm text-pretty text-muted-foreground">{o.description}</p>
                )}
                <p className="text-sm text-muted-foreground">
                  {[
                    only,
                    o.summary,
                    o.validUntil &&
                      `until ${formatDate(o.validUntil, business.timezone, "short", business.locale)}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <Link
                  href={bookHref(single)}
                  className={cn(
                    "focus-ring mt-auto inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-brand underline-offset-4 hover:underline",
                    touchHitArea,
                  )}
                >
                  Book {only ?? "now"}
                  <span className="sr-only"> with {o.name}</span>
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      </SiteContainer>
    </section>
  );
}
